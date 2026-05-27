---
name: gfos-db-readonly
description: Run a single read-only SQL Server query against GFOS databases using built-in WildFly profile mappings. Default target is gfos2025_dev1.
---

Use this skill when the user asks to inspect GFOS database content, compare environments, or run a read-only SQL query.

## Goal

Execute one safe read-only query with as little friction as possible.

- Default profile: `dev1`
- Do not assume any external helper script such as `gfos.ps1`
- Resolve the target database from the built-in profile map in `profiles.json`
- Use exactly one wrapper call per query unless that single call fails before reaching the database
- Always tell the user which profile, server instance, and database were used

## Available profiles

- `dev1`: default HG datasource on `gfos2025_dev1`
- `mhg1`: HG datasource on `gfos2025_mhg1`
- `web-dev1`: web datasource on `gfos2025_dev1`
- `web-mhg1`: web datasource on `gfos2025_mhg1`

## Execution rule

Use this wrapper and nothing else for normal queries:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\vincent_m\.copilot\skills\gfos-db-readonly\db-query.ps1" -Query "SELECT ..." -Profile dev1 -AsJson
```

If the user does not specify a profile, use `dev1`.

## Guardrails

- Only `SELECT` is allowed
- No multiple statements
- No `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `EXEC`
- Do not silently switch profiles if one profile fails; report the failure and ask only if the user wants another target
- Keep output compact and mention row count
- The wrapper injects a `TOP (n)` limit when the query does not already specify one

## What to report back

Always include:

- profile used
- server instance used
- database used
- effective query limit
- row count returned
- compact result summary

## When not to use this skill

- Any write request
- Schema changes
- Bulk export jobs
- Multi-step SQL scripts
- Queries that require human approval for a different target than the default and the user has not specified one
