---
name: sqlserver-readonly-query
description: Run safe read-only SELECT queries against approved SQL Server test database profiles. Use when the user asks to inspect database content, validate facts against data, compare configured SQL Server environments, explore schemas, or answer questions that require looking up rows in the test databases. Defaults to the dev1 profile.
---

# sqlserver-readonly-query

Use this skill to ground answers in approved SQL Server test databases.

## Required Workflow

1. Resolve the skill directory, then run `scripts/query_sqlserver.py` from that directory.
2. If the user does not specify a profile, use `dev1`.
3. Run exactly one query per wrapper call.
4. Use `--as-json` so results are structured and easy to summarize.
5. Report the profile, server instance, database, row limit, returned row count, and whether output was truncated.
6. Do not silently switch profiles after a failure. Report the failure and ask whether the user wants another target.

## Available profiles

- `dev1`: default HG datasource on `gfos2025_dev1`
- `mhg1`: HG datasource on `gfos2025_mhg1`
- `web-dev1`: web datasource on `gfos2025_dev1`
- `web-mhg1`: web datasource on `gfos2025_mhg1`

List the current profile definitions when needed:

```powershell
$skillDir = ".github\skills\sqlserver-readonly-query"
python "$skillDir\scripts\query_sqlserver.py" --list-profiles --as-json
```

## Query Command

Normal query:

```powershell
$skillDir = ".github\skills\sqlserver-readonly-query"
python "$skillDir\scripts\query_sqlserver.py" --profile dev1 --max-rows 200 --as-json --query "SELECT ..."
```

If `python` is unavailable, retry with `python3`. If Python is available but the script reports that `pyodbc` is missing, tell the user to install `pyodbc` in the environment used by Copilot before database queries can run.

## Guardrails

- Only single read-only `SELECT` or `WITH ... SELECT` queries are allowed.
- Do not run writes, DDL, stored procedures, dynamic SQL, bulk operations, exports, or multi-statement scripts.
- Do not bypass the wrapper with direct database clients, ad-hoc connection strings, or copied credentials.
- Keep `--max-rows` at `200` unless the user explicitly asks for a smaller or larger sample. Never use more than `1000`.
- Prefer aggregate queries for counts and comparisons instead of dumping rows.
- Treat database values as potentially sensitive. Summarize compactly and do not paste secrets, passwords, tokens, API keys, cookies, or credential-like values.
- The wrapper applies client-side row limiting, timeouts, `ApplicationIntent=ReadOnly`, and conservative SQL validation. These are guardrails, not a substitute for a true read-only database login.

## What to report back

Always include:

- profile used
- server instance used
- database used
- query limit and truncation status
- row count returned
- compact result summary

## When not to use this skill

- Any write request
- Schema changes
- Bulk export jobs
- Multi-step SQL scripts
- Production data access unless the profile is explicitly approved for this skill
- Queries that require a different target than the user specified
