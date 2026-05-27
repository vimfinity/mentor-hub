---
name: database-readonly-query
description: Run safe read-only queries and schema-introspection against approved GFOS test database profiles across versions 4.8, 4.8plus, and 2025. Use when the user asks to inspect database content, validate facts against data, compare configured database environments, discover tables/columns, or answer questions that require looking up rows in approved SQL Server or Oracle test databases. Defaults to the 2025-dev1 profile.
---

# database-readonly-query

Use this skill to ground answers in approved test databases without guessing schemas or values. Database operations run with the operating-system or database identity of the person using the agent; the agent does not have or need its own database account.

## Required Workflow

1. Resolve the skill directory, then run `scripts/query_database.py`.
2. If the user does not specify a profile, use `2025-dev1`.
3. Start with schema discovery when table names, column names, or relationships are unclear.
4. Run exactly one query or one introspection operation per wrapper call.
5. Use `--as-json` so results are structured and easy to summarize.
6. Report profile, engine, resolved source, database/service, row limit, returned row count, and truncation status.
7. Do not silently switch profiles after a failure. Report the failure and ask whether the user wants another target.

## Profiles

Profiles live in `profiles.json`. A profile declares the approved logical target, not the secret connection details.

Required fields:

- `name`, `aliases`, `description`
- `version`: `4.8`, `4.8plus`, or `2025`
- `engine`: `sqlserver` or `oracle`
- `serverLabel`: non-secret host/instance label for disambiguation
- `databaseLabel`: non-secret human label for reporting
- `serviceLabel`: Oracle service label when applicable
- `connection.type: "env"`
- `connection.envVar`: environment variable that contains the real connection string or DSN

Do not store database usernames, passwords, tokens, or full connection strings in this repository. Configure the referenced environment variable in the user, machine, CI, or secret-manager context used by the agent.

Prefer user-bound authentication:

- SQL Server: use Windows authentication / integrated security whenever possible. The database grants must be assigned to the user's Windows identity or AD group.
- Oracle: use external authentication, wallet, TNS, or another user-bound enterprise auth mechanism whenever possible.
- Password-bearing connection strings are a fallback for test-only read access, not the preferred setup.

Examples:

- SQL Server with Windows auth: `Driver={ODBC Driver 18 for SQL Server};Server=tcp:server.example;Database=DbName;Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=no;ApplicationIntent=ReadOnly`
- SQL Server with SQL auth: `Driver={ODBC Driver 18 for SQL Server};Server=tcp:server.example;Database=DbName;Uid=readonly_user;Pwd=...;Encrypt=yes;TrustServerCertificate=no;ApplicationIntent=ReadOnly`
- Oracle: `readonly_user/password@host.example:1521/service`
- Oracle JSON for external auth or wallets: `{"dsn":"host.example:1521/service","externalAuth":true}`

## One-Time Local Setup

Set each connection variable once in the environment that starts VS Code/Copilot. Do not pass connection strings in prompts or per command.

Recommended options, in order:

1. Use integrated authentication or externally managed auth where possible. The environment variable can then contain a passwordless connection string, DSN, TNS alias, or wallet-backed Oracle descriptor.
2. Use a persistent user-level or machine-level environment variable for test-only read-only credentials when integrated auth is not available. This is practical for local Copilot usage, but not the strongest secrets-management option.
3. Use a secret manager or enterprise-managed environment injection when running agents in CI or shared automation.

Windows user-level setup without putting the connection string into shell history:

```powershell
$secure = Read-Host "DATABASE_READONLY_2025_DEV1 connection string" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  [Environment]::SetEnvironmentVariable("DATABASE_READONLY_2025_DEV1", $plain, "User")
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
```

After changing persistent environment variables, restart VS Code so Copilot inherits them.

For repeated local setup, set the environment variables once per profile listed by `--list-profiles`. Agents then use only profile names such as `2025-mhg1`, `48-test`, or `48plus-unicode`.

## Commands

List profiles:

```powershell
$skillDir = ".github\skills\database-readonly-query"
python "$skillDir\scripts\query_database.py" --list-profiles --as-json
```

Discover tables:

```powershell
$skillDir = ".github\skills\database-readonly-query"
python "$skillDir\scripts\query_database.py" --profile 2025-dev1 --schema tables --as-json
```

Discover columns for a table:

```powershell
$skillDir = ".github\skills\database-readonly-query"
python "$skillDir\scripts\query_database.py" --profile 2025-dev1 --schema columns --table SOME_TABLE --as-json
```

Search table names:

```powershell
$skillDir = ".github\skills\database-readonly-query"
python "$skillDir\scripts\query_database.py" --profile 2025-dev1 --schema search --search employee --as-json
```

Run one read-only query:

```powershell
$skillDir = ".github\skills\database-readonly-query"
python "$skillDir\scripts\query_database.py" --profile 2025-dev1 --max-rows 200 --as-json --query "SELECT ..."
```

If `python` is unavailable, retry with `python3`. If the script reports a missing package, install it in the Python environment used by Copilot:

- SQL Server: `pyodbc` plus a Microsoft ODBC Driver for SQL Server
- Oracle: `oracledb`

## Guardrails

- Only single read-only `SELECT` or `WITH ... SELECT` queries are allowed.
- Do not run writes, DDL, stored procedures, dynamic SQL, bulk operations, exports, or multi-statement scripts.
- Do not bypass the wrapper with direct database clients, ad-hoc connection strings, or copied credentials.
- Keep `--max-rows` at `200` unless the user explicitly asks for a smaller or larger sample. Never use more than `1000`.
- Prefer aggregate queries for counts and comparisons instead of dumping rows.
- Treat database values as potentially sensitive. Summarize compactly and do not paste secrets, passwords, tokens, API keys, cookies, or credential-like values.
- The wrapper applies client-side row limiting, timeouts, read-only connection intent where supported, and conservative SQL validation. These are guardrails, not a substitute for a true read-only database login.
- If an environment variable is missing, stop and report the exact variable name. Do not search application server XML files, local config files, or source code for credentials.

## What to Report Back

Always include profile, engine, resolved connection source, database/service, query limit, truncation status, row count, and a compact result summary.

## When Not To Use This Skill

- Any write request
- Schema changes
- Bulk export jobs
- Multi-step SQL scripts
- Queries that require a different target than the user specified
