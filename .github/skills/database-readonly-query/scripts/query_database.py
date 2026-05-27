#!/usr/bin/env python3
"""Read-only database query wrapper for agent skills."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import decimal
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

MAX_ROWS = 1000
DEFAULT_ROWS = 200
BANNED = re.compile(
    r"\b(insert|update|delete|merge|truncate|alter|drop|create|exec|execute|"
    r"grant|revoke|deny|dbcc|backup|restore|bulk|openrowset|opendatasource|"
    r"openquery|sp_configure|call)\b|xp_",
    re.I,
)
SENSITIVE = re.compile(r"(password|passwd|pwd|token|secret|credential|hash|salt|api[_-]?key|session|cookie)", re.I)


class QueryError(RuntimeError):
    pass


def root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_profiles() -> dict[str, Any]:
    return json.loads((root() / "profiles.json").read_text(encoding="utf-8"))


def resolve_profile(config: dict[str, Any], requested: str | None) -> dict[str, Any]:
    name = requested or config.get("defaultProfile")
    normalized = str(name).strip().lower()
    for profile in config.get("profiles", []):
        candidates = [profile.get("name"), *profile.get("aliases", [])]
        if normalized in [str(candidate).strip().lower() for candidate in candidates]:
            return profile
    available = ", ".join(p.get("name", "") for p in config.get("profiles", []))
    raise QueryError(f"Unknown profile '{name}'. Available profiles: {available}")


def env_connection(profile: dict[str, Any], source: dict[str, Any]) -> dict[str, Any] | None:
    env_var = source["envVar"]
    value = os.environ.get(env_var)
    if not value:
        return None
    return {"type": "env", "source": env_var, "database": None, "service": None, "raw": value}


def resolve_connection(profile: dict[str, Any]) -> dict[str, Any]:
    source = profile.get("connection")
    if not source:
        raise QueryError(f"Profile '{profile.get('name')}' has no connection source.")
    if source.get("type") != "env":
        raise QueryError(f"Unsupported connection type '{source.get('type')}'. Use type 'env'.")
    resolved = env_connection(profile, source)
    if not resolved:
        raise QueryError(f"Environment variable {source['envVar']} is not set.")
    resolved["database"] = profile.get("databaseLabel")
    resolved["service"] = profile.get("serviceLabel") if profile.get("engine") == "oracle" else None
    return resolved


def mask_sql(sql: str) -> str:
    out: list[str] = []
    i = 0
    state = "normal"
    while i < len(sql):
        c = sql[i]
        n = sql[i + 1] if i + 1 < len(sql) else ""
        if state == "normal":
            if c == "-" and n == "-":
                out += [" ", " "]; i += 2; state = "line"; continue
            if c == "/" and n == "*":
                out += [" ", " "]; i += 2; state = "block"; continue
            if c in "'\"[":
                out.append(" "); i += 1; state = {"'": "sq", '"': "dq", "[": "br"}[c]; continue
            out.append(c); i += 1; continue
        out.append(c if state == "line" and c in "\r\n" else " ")
        if state == "line" and c in "\r\n":
            state = "normal"
        elif state == "block" and c == "*" and n == "/":
            out.append(" "); i += 1; state = "normal"
        elif state == "sq" and c == "'" and n == "'":
            out.append(" "); i += 1
        elif state == "sq" and c == "'":
            state = "normal"
        elif state == "dq" and c == '"' and n == '"':
            out.append(" "); i += 1
        elif state == "dq" and c == '"':
            state = "normal"
        elif state == "br" and c == "]":
            state = "normal"
        i += 1
    return "".join(out)


def validate_query(sql: str) -> str:
    if not sql or not sql.strip():
        raise QueryError("Query is required.")
    trimmed = sql.strip()
    if trimmed.endswith(";"):
        trimmed = trimmed[:-1].strip()
    masked = re.sub(r"\s+", " ", mask_sql(trimmed)).strip()
    if ";" in masked:
        raise QueryError("Multiple statements are not allowed.")
    if not re.match(r"(?is)^(select\b|with\b)", masked):
        raise QueryError("Only a single SELECT or WITH ... SELECT query is allowed.")
    if BANNED.search(masked):
        raise QueryError("Write, DDL, procedure, bulk, or administrative keywords are not allowed.")
    if re.search(r"(?is)\bselect\b.*\binto\b", masked):
        raise QueryError("SELECT INTO is not allowed.")
    return trimmed


def scalar(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (dt.date, dt.datetime, dt.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, bytes):
        return {"base64": base64.b64encode(value).decode("ascii"), "byteLength": len(value)}
    return str(value)


def redact(row: dict[str, Any], enabled: bool) -> dict[str, Any]:
    if not enabled:
        return row
    return {k: ("<redacted>" if SENSITIVE.search(k) and v is not None else v) for k, v in row.items()}


def sqlserver_conn(conn: dict[str, Any], timeout: int):
    import pyodbc  # type: ignore
    if conn.get("raw"):
        raw = conn["raw"]
        lower_raw = raw.lower()
        if "driver=" not in lower_raw and "dsn=" not in lower_raw:
            raw = "Driver={ODBC Driver 18 for SQL Server};" + raw
        if "applicationintent=" not in raw.lower():
            raw = raw.rstrip(";") + ";ApplicationIntent=ReadOnly"
    else:
        data = conn["sqlserver"]
        raw = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={data['server']};DATABASE={data['database']};UID={data['uid']};PWD={data['pwd']};"
            f"Encrypt={data['encrypt']};TrustServerCertificate={data['trust']};"
            "ApplicationIntent=ReadOnly;"
            f"APP={data['app']}"
        )
    return pyodbc.connect(raw, timeout=timeout, autocommit=True)


def oracle_conn(conn: dict[str, Any]):
    import oracledb  # type: ignore
    raw = conn["raw"]
    if raw.strip().startswith("{"):
        data = json.loads(raw)
        dsn = data.get("dsn")
        if data.get("externalAuth"):
            return oracledb.connect(dsn=dsn, externalauth=True)
        return oracledb.connect(user=data.get("user"), password=data.get("password"), dsn=dsn)
    if "@" in raw and "/" in raw.split("@", 1)[0]:
        user_pwd, dsn = raw.split("@", 1)
        user, pwd = user_pwd.split("/", 1)
        return oracledb.connect(user=user, password=pwd, dsn=dsn)
    return oracledb.connect(dsn=raw)


def sql_literal(value: str) -> str:
    return value.replace("'", "''")


def split_table_name(table: str) -> tuple[str | None, str]:
    parts = table.split(".", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return None, table


def schema_sql(engine: str, mode: str, table: str | None, search: str | None) -> str:
    if table and not re.match(r"^[A-Za-z0-9_.$#]+$", table):
        raise QueryError("--table may only contain letters, digits, _, ., $, and #")
    if search and not re.match(r"^[A-Za-z0-9_.$# -]+$", search):
        raise QueryError("--search contains unsupported characters")
    term = (search or "").upper().replace("'", "''")
    if engine == "sqlserver":
        if mode == "tables":
            return "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA, TABLE_NAME"
        if mode == "columns":
            if not table:
                raise QueryError("--table is required for --schema columns")
            schema, table_name = split_table_name(table)
            where = f"TABLE_NAME = '{sql_literal(table_name)}'"
            if schema:
                where += f" AND TABLE_SCHEMA = '{sql_literal(schema)}'"
            return f"SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE {where} ORDER BY ORDINAL_POSITION"
        if mode == "search":
            return f"SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE UPPER(TABLE_NAME) LIKE '%{term}%' ORDER BY TABLE_SCHEMA, TABLE_NAME"
    if engine == "oracle":
        if mode == "tables":
            return "SELECT OWNER, TABLE_NAME FROM ALL_TABLES ORDER BY OWNER, TABLE_NAME"
        if mode == "columns":
            if not table:
                raise QueryError("--table is required for --schema columns")
            owner, table_name = split_table_name(table.upper())
            where = f"TABLE_NAME = '{sql_literal(table_name)}'"
            if owner:
                where += f" AND OWNER = '{sql_literal(owner)}'"
            return f"SELECT OWNER, TABLE_NAME, COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_LENGTH FROM ALL_TAB_COLUMNS WHERE {where} ORDER BY COLUMN_ID"
        if mode == "search":
            return f"SELECT OWNER, TABLE_NAME FROM ALL_TABLES WHERE UPPER(TABLE_NAME) LIKE '%{term}%' ORDER BY OWNER, TABLE_NAME"
    raise QueryError(f"Unsupported schema operation '{mode}' for engine '{engine}'.")


def fetch(engine: str, conn_info: dict[str, Any], sql: str, max_rows: int, connect_timeout: int, query_timeout: int, redact_sensitive: bool) -> tuple[list[dict[str, Any]], bool]:
    connect = sqlserver_conn(conn_info, connect_timeout) if engine == "sqlserver" else oracle_conn(conn_info)
    with connect as connection:
        if engine == "sqlserver":
            connection.timeout = query_timeout
        cur = connection.cursor()
        if engine == "sqlserver":
            cur.execute("SET LOCK_TIMEOUT 5000; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(sql)
        columns = [c[0] for c in (cur.description or [])]
        rows = []
        for raw in cur.fetchmany(max_rows + 1):
            rows.append(redact({columns[i]: scalar(v) for i, v in enumerate(raw)}, redact_sensitive))
        truncated = len(rows) > max_rows
        return rows[:max_rows], truncated


def result(ok: bool, message: str, profile: dict[str, Any] | None = None, conn: dict[str, Any] | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "ok": ok,
        "message": message,
        "profile": profile.get("name") if profile else None,
        "version": profile.get("version") if profile else None,
        "engine": profile.get("engine") if profile else None,
        "serverLabel": profile.get("serverLabel") if profile else None,
        "databaseLabel": profile.get("databaseLabel") if profile else None,
        "serviceLabel": profile.get("serviceLabel") if profile else None,
        "connectionType": conn.get("type") if conn else None,
        "connectionSource": conn.get("source") if conn else None,
        "database": conn.get("database") if conn else None,
        "service": conn.get("service") if conn else None,
        **extra,
    }


def write(data: Any, as_json: bool) -> None:
    if as_json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))


def self_test() -> dict[str, Any]:
    for q in ["SELECT 1", "WITH x AS (SELECT 1 a) SELECT a FROM x", "SELECT ';' AS literal"]:
        validate_query(q)
    for q in ["UPDATE x SET y=1", "SELECT 1; SELECT 2", "EXEC sp_who2", "SELECT * INTO copy FROM src"]:
        try:
            validate_query(q)
        except QueryError:
            continue
        raise QueryError(f"Self-test expected rejection for {q}")
    return {"ok": True, "message": "Self-test passed."}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--profile")
    p.add_argument("--query")
    p.add_argument("--schema", choices=["tables", "columns", "search"])
    p.add_argument("--table")
    p.add_argument("--search")
    p.add_argument("--max-rows", type=int, default=DEFAULT_ROWS)
    p.add_argument("--connect-timeout", type=int, default=15)
    p.add_argument("--query-timeout", type=int, default=30)
    p.add_argument("--as-json", action="store_true")
    p.add_argument("--list-profiles", action="store_true")
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--no-redact-sensitive", action="store_true")
    args = p.parse_args()
    profile = None
    conn = None
    max_rows = max(1, min(args.max_rows, MAX_ROWS))
    try:
        if args.self_test:
            write(self_test(), args.as_json); return 0
        config = load_profiles()
        if args.list_profiles:
            profiles = []
            for item in config["profiles"]:
                profile_info = {k: v for k, v in item.items() if k != "connection"}
                profile_info["connectionEnvVar"] = item.get("connection", {}).get("envVar")
                profiles.append(profile_info)
            write(profiles, args.as_json); return 0
        profile = resolve_profile(config, args.profile)
        conn = resolve_connection(profile)
        sql = schema_sql(profile["engine"], args.schema, args.table, args.search) if args.schema else validate_query(args.query or "")
        rows, truncated = fetch(profile["engine"], conn, sql, max_rows, args.connect_timeout, args.query_timeout, not args.no_redact_sensitive)
        write(result(True, "Query executed successfully.", profile, conn, queryExecuted=sql, maxRows=max_rows, rowCount=len(rows), truncated=truncated, rows=rows), args.as_json)
        return 0
    except Exception as exc:
        write(result(False, str(exc), profile, conn, queryOriginal=args.query, maxRows=max_rows, rowCount=0, truncated=False, rows=[]), args.as_json)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
