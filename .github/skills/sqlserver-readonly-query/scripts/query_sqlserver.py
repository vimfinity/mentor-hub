#!/usr/bin/env python3
"""Read-only SQL Server query wrapper for agent skills."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import decimal
import json
import re
import sys
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


MAX_ALLOWED_ROWS = 1000
DEFAULT_MAX_ROWS = 200
DEFAULT_CONNECT_TIMEOUT = 15
DEFAULT_QUERY_TIMEOUT = 30
BANNED_KEYWORDS = re.compile(
    r"\b("
    r"insert|update|delete|merge|truncate|alter|drop|create|exec|execute|"
    r"grant|revoke|deny|dbcc|backup|restore|bulk|openrowset|opendatasource|"
    r"openquery|sp_configure"
    r")\b|xp_",
    re.IGNORECASE,
)
SENSITIVE_COLUMN = re.compile(
    r"(password|passwd|pwd|token|secret|credential|hash|salt|api[_-]?key|session|cookie)",
    re.IGNORECASE,
)


class QueryError(RuntimeError):
    pass


def skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_profiles() -> dict[str, Any]:
    profile_path = skill_root() / "profiles.json"
    if not profile_path.exists():
        raise QueryError(f"profiles.json not found at {profile_path}")
    return json.loads(profile_path.read_text(encoding="utf-8"))


def resolve_profile(config: dict[str, Any], requested: str | None) -> dict[str, Any]:
    name = requested or config.get("defaultProfile")
    for profile in config.get("profiles", []):
        aliases = profile.get("aliases") or []
        if profile.get("name") == name or name in aliases:
            return profile
    available = ", ".join(profile.get("name", "") for profile in config.get("profiles", []))
    raise QueryError(f"Unknown profile '{name}'. Available profiles: {available}")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def direct_children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in list(element) if local_name(child.tag) == name]


def descendants(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element.iter() if local_name(child.tag) == name]


def resolve_datasource(profile: dict[str, Any]) -> dict[str, Any]:
    config_path = Path(profile["configPath"])
    if not config_path.exists():
        raise QueryError(f"Datasource config not found: {config_path}")

    root = ET.parse(config_path).getroot()
    jndi_name = profile["jndiName"]
    datasource = next(
        (
            node
            for node in descendants(root, "datasource")
            if node.attrib.get("jndi-name") == jndi_name
        ),
        None,
    )
    if datasource is None:
        raise QueryError(f"Datasource '{jndi_name}' not found in {config_path}")

    properties: dict[str, str] = {}
    for prop in direct_children(datasource, "connection-property"):
        name = prop.attrib.get("name")
        if name:
            properties[name] = (prop.text or "").strip()

    security = next(iter(direct_children(datasource, "security")), None)
    if security is None:
        raise QueryError(f"Security block missing for datasource '{jndi_name}' in {config_path}")

    return {
        "serverName": properties.get("ServerName"),
        "instanceName": properties.get("instanceName"),
        "databaseName": properties.get("DatabaseName"),
        "encrypt": properties.get("encrypt", "true"),
        "trustServerCertificate": properties.get("trustServerCertificate", "false"),
        "applicationName": properties.get("ApplicationName") or "agent-sqlserver-readonly-query",
        "userName": security.attrib.get("user-name"),
        "password": security.attrib.get("password"),
        "jndiName": datasource.attrib.get("jndi-name"),
    }


def mask_sql(sql: str) -> str:
    result: list[str] = []
    i = 0
    state = "normal"
    while i < len(sql):
        char = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""

        if state == "normal":
            if char == "-" and nxt == "-":
                result.extend("  ")
                i += 2
                state = "line_comment"
                continue
            if char == "/" and nxt == "*":
                result.extend("  ")
                i += 2
                state = "block_comment"
                continue
            if char == "'":
                result.append(" ")
                i += 1
                state = "single_quote"
                continue
            if char == '"':
                result.append(" ")
                i += 1
                state = "double_quote"
                continue
            if char == "[":
                result.append(" ")
                i += 1
                state = "bracket"
                continue
            result.append(char)
            i += 1
            continue

        if state == "line_comment":
            if char in "\r\n":
                result.append(char)
                state = "normal"
            else:
                result.append(" ")
            i += 1
            continue

        if state == "block_comment":
            result.append(" ")
            if char == "*" and nxt == "/":
                result.append(" ")
                i += 2
                state = "normal"
            else:
                i += 1
            continue

        if state == "single_quote":
            result.append(" ")
            if char == "'" and nxt == "'":
                result.append(" ")
                i += 2
            elif char == "'":
                i += 1
                state = "normal"
            else:
                i += 1
            continue

        if state == "double_quote":
            result.append(" ")
            if char == '"' and nxt == '"':
                result.append(" ")
                i += 2
            elif char == '"':
                i += 1
                state = "normal"
            else:
                i += 1
            continue

        if state == "bracket":
            result.append(" ")
            if char == "]":
                state = "normal"
            i += 1

    return "".join(result)


def validate_query(sql: str) -> str:
    if not sql or not sql.strip():
        raise QueryError("Query is required.")

    trimmed = sql.strip()
    if trimmed.endswith(";"):
        trimmed = trimmed[:-1].strip()

    masked = mask_sql(trimmed)
    if ";" in masked:
        raise QueryError("Multiple statements are not allowed.")

    normalized = re.sub(r"\s+", " ", masked).strip()
    if not re.match(r"(?is)^(select\b|with\b)", normalized):
        raise QueryError("Only a single SELECT or WITH ... SELECT query is allowed.")
    if BANNED_KEYWORDS.search(normalized):
        raise QueryError("Write, DDL, procedure, bulk, or administrative keywords are not allowed.")
    if re.search(r"(?is)\bselect\b.*\binto\b", normalized):
        raise QueryError("SELECT INTO is not allowed.")

    return trimmed


def choose_driver(requested: str | None) -> str:
    if requested:
        return requested
    try:
        import pyodbc  # type: ignore
    except ModuleNotFoundError as exc:
        raise QueryError("Python package 'pyodbc' is not installed.") from exc

    candidates = [
        driver
        for driver in pyodbc.drivers()
        if "ODBC Driver" in driver and "SQL Server" in driver
    ]
    if candidates:
        return sorted(candidates)[-1]
    return "ODBC Driver 18 for SQL Server"


def bool_text(value: Any, default: bool) -> str:
    if value is None:
        return "yes" if default else "no"
    return "yes" if str(value).strip().lower() in {"1", "true", "yes"} else "no"


def connection_string(datasource: dict[str, Any], driver: str) -> str:
    server = datasource["serverName"]
    if datasource.get("instanceName"):
        server = f"{server}\\{datasource['instanceName']}"

    parts = {
        "DRIVER": "{" + driver + "}",
        "SERVER": server,
        "DATABASE": datasource["databaseName"],
        "UID": datasource["userName"],
        "PWD": datasource["password"],
        "Encrypt": bool_text(datasource.get("encrypt"), True),
        "TrustServerCertificate": bool_text(datasource.get("trustServerCertificate"), False),
        "ApplicationIntent": "ReadOnly",
        "APP": datasource.get("applicationName") or "agent-sqlserver-readonly-query",
    }
    return ";".join(f"{key}={value}" for key, value in parts.items() if value is not None)


def json_value(value: Any) -> Any:
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


def redact_row(row: dict[str, Any], redact_sensitive: bool) -> dict[str, Any]:
    if not redact_sensitive:
        return row
    return {
        key: ("<redacted>" if SENSITIVE_COLUMN.search(key) and value is not None else value)
        for key, value in row.items()
    }


def execute_query(
    datasource: dict[str, Any],
    query: str,
    max_rows: int,
    connect_timeout: int,
    query_timeout: int,
    driver: str | None,
    redact_sensitive: bool,
) -> dict[str, Any]:
    try:
        import pyodbc  # type: ignore
    except ModuleNotFoundError as exc:
        raise QueryError("Python package 'pyodbc' is not installed.") from exc

    selected_driver = choose_driver(driver)
    conn_str = connection_string(datasource, selected_driver)
    rows: list[dict[str, Any]] = []

    with pyodbc.connect(conn_str, timeout=connect_timeout, autocommit=True) as connection:
        connection.timeout = query_timeout
        cursor = connection.cursor()
        cursor.execute("SET LOCK_TIMEOUT 5000; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cursor.execute(query)
        columns = [column[0] for column in (cursor.description or [])]
        for raw_row in cursor.fetchmany(max_rows + 1):
            item = {columns[index]: json_value(value) for index, value in enumerate(raw_row)}
            rows.append(redact_row(item, redact_sensitive))

    truncated = len(rows) > max_rows
    if truncated:
        rows = rows[:max_rows]

    return {
        "driver": selected_driver,
        "rows": rows,
        "rowCount": len(rows),
        "truncated": truncated,
    }


def metadata(profile: dict[str, Any] | None, datasource: dict[str, Any] | None) -> dict[str, Any]:
    server_instance = None
    database = None
    if datasource:
        server_instance = datasource.get("serverName")
        if datasource.get("instanceName"):
            server_instance = f"{server_instance}\\{datasource['instanceName']}"
        database = datasource.get("databaseName")

    return {
        "profile": profile.get("name") if profile else None,
        "profileDescription": profile.get("description") if profile else None,
        "configPath": profile.get("configPath") if profile else None,
        "jndiName": datasource.get("jndiName") if datasource else None,
        "serverInstance": server_instance,
        "database": database,
    }


def build_result(
    ok: bool,
    message: str,
    profile: dict[str, Any] | None = None,
    datasource: dict[str, Any] | None = None,
    query_original: str | None = None,
    query_executed: str | None = None,
    max_rows: int = DEFAULT_MAX_ROWS,
    rows: list[dict[str, Any]] | None = None,
    truncated: bool = False,
    driver: str | None = None,
) -> dict[str, Any]:
    output = {
        "ok": ok,
        "message": message,
        **metadata(profile, datasource),
        "driver": driver,
        "queryOriginal": query_original,
        "queryExecuted": query_executed,
        "maxRows": max_rows,
        "rowCount": len(rows or []),
        "truncated": truncated,
        "rows": rows or [],
    }
    return output


def write_result(result: Any, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    if isinstance(result, list):
        for item in result:
            print(f"{item['name']}: {item['description']} ({item['configPath']} / {item['jndiName']})")
        return

    print(f"Status      : {'OK' if result['ok'] else 'ERROR'}")
    print(f"Message     : {result['message']}")
    print(f"Profile     : {result['profile']}")
    print(f"Server      : {result['serverInstance']}")
    print(f"Database    : {result['database']}")
    print(f"Driver      : {result['driver']}")
    print(f"Rows        : {result['rowCount']}")
    print(f"MaxRows     : {result['maxRows']}")
    print(f"Truncated   : {result['truncated']}")
    if result["rows"]:
        print(json.dumps(result["rows"], indent=2, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one safe read-only SQL Server query.")
    parser.add_argument("--profile", default=None, help="Profile name or alias from profiles.json.")
    parser.add_argument("--query", default=None, help="Single SELECT query to execute.")
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS, help="Maximum rows to return.")
    parser.add_argument("--connect-timeout", type=int, default=DEFAULT_CONNECT_TIMEOUT)
    parser.add_argument("--query-timeout", type=int, default=DEFAULT_QUERY_TIMEOUT)
    parser.add_argument("--driver", default=None, help="ODBC driver name. Defaults to latest installed SQL Server driver.")
    parser.add_argument("--as-json", action="store_true", help="Emit JSON.")
    parser.add_argument("--list-profiles", action="store_true", help="List configured profiles without connecting.")
    parser.add_argument("--self-test", action="store_true", help="Run local validation checks without connecting.")
    parser.add_argument("--no-redact-sensitive", action="store_true", help="Do not redact sensitive-looking columns.")
    return parser.parse_args()


def self_test() -> dict[str, Any]:
    valid = [
        "SELECT 1",
        "select top 10 * from dbo.Users",
        "WITH recent AS (SELECT 1 AS id) SELECT id FROM recent",
        "SELECT ';' AS literal",
    ]
    invalid = [
        "UPDATE dbo.Users SET name = 'x'",
        "SELECT * INTO dbo.Copy FROM dbo.Users",
        "SELECT 1; SELECT 2",
        "EXEC sp_who2",
        "DELETE FROM dbo.Users",
    ]
    for query in valid:
        validate_query(query)
    for query in invalid:
        try:
            validate_query(query)
        except QueryError:
            continue
        raise QueryError(f"Self-test expected rejection for: {query}")
    return {"ok": True, "message": "Self-test passed.", "validCases": len(valid), "invalidCases": len(invalid)}


def main() -> int:
    args = parse_args()
    profile = None
    datasource = None
    max_rows = max(1, min(args.max_rows, MAX_ALLOWED_ROWS))

    try:
        if args.self_test:
            write_result(self_test(), args.as_json)
            return 0

        config = load_profiles()
        if args.list_profiles:
            profiles = [
                {
                    "name": item.get("name"),
                    "aliases": item.get("aliases", []),
                    "description": item.get("description"),
                    "configPath": item.get("configPath"),
                    "jndiName": item.get("jndiName"),
                    "isDefault": item.get("name") == config.get("defaultProfile"),
                }
                for item in config.get("profiles", [])
            ]
            write_result(profiles, args.as_json)
            return 0

        query = validate_query(args.query or "")
        profile = resolve_profile(config, args.profile)
        datasource = resolve_datasource(profile)
        execution = execute_query(
            datasource=datasource,
            query=query,
            max_rows=max_rows,
            connect_timeout=args.connect_timeout,
            query_timeout=args.query_timeout,
            driver=args.driver,
            redact_sensitive=not args.no_redact_sensitive,
        )
        result = build_result(
            ok=True,
            message="Query executed successfully.",
            profile=profile,
            datasource=datasource,
            query_original=query,
            query_executed=query,
            max_rows=max_rows,
            rows=execution["rows"],
            truncated=execution["truncated"],
            driver=execution["driver"],
        )
        write_result(result, args.as_json)
        return 0
    except Exception as exc:
        result = build_result(
            ok=False,
            message=str(exc),
            profile=profile,
            datasource=datasource,
            query_original=args.query,
            max_rows=max_rows,
        )
        write_result(result, args.as_json)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
