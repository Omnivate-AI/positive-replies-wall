# M2 — Smartlead access setup

Wired up two interfaces to Smartlead from this Claude Code instance: the **MCP** (per the brief) and the **CLI** (per Omnivate production practice). Same `SMARTLEAD_API_KEY` works for both.

## What was installed

| Interface | Source | Auth |
|---|---|---|
| MCP server | `npx -y smartlead-mcp-by-leadmagic` ([LeadMagic, archived 2026-02-03](https://github.com/LeadMagic/smartlead-mcp-server)) | `SMARTLEAD_API_KEY` env var |
| CLI | `npm install -g @smartlead/cli` (v0.1.0) | `SMARTLEAD_API_KEY` env var, `--api-key` flag, or `smartlead config set api_key` |

The MCP is registered at **user scope** (`~/.claude.json`), not project scope, so it's available across all of this Claude Code instance's projects. The API key is stored in the user-scope config locally — not committed to any repo. The project-local key lives in `.env` (which should be `.gitignore`d when the repo is initialized in M8).

## Smoke tests

All three CLI tests passed against the live workspace:

```
$ smartlead clients list
CLIENTS FOUND: 9
  264121: Valda Energy
  255540: Mehdi Benbrahim
  216271: Christie
  221217: Josh Arnold
  232667: Andrew Last
  ...
```

```
$ smartlead campaigns list --client-id 216271
CAMPAIGNS: 10
  2973559: Roosterpunk_v6_US_Fallback [ACTIVE]
  2972871: Roosterpunk_v5_US_LinkedIn [ACTIVE]
  2900536: Roosterpunk_v3_US_100to1000 [ACTIVE]
  ...
```

```
$ smartlead inbox replies --limit 5
REPLIES RETURNED: 5
  (5 replies returned with sender, subject, lead_category)
```

MCP server verified standalone:
- Starts cleanly: `🚀 SmartLead MCP Server v1.6.1`
- Auth confirmed: `✅ SmartLead API connection successful`
- Loads 49/113 tools by default (essentials: campaigns, leads, email accounts, statistics)
- Claude Code health check: `✓ Connected`

**MCP tool availability requires a Claude Code restart** — MCP servers load at session start, so `mcp__smartlead__*` tools become callable only in the next session. The Loom recording should be made post-restart so the MCP tools show up in the in-session demo.

## Important context for downstream work

- **Production team has disabled the MCP** in their main repo (`outbound/knowledge/tools/smartlead.md`) because it eats 50-80K tokens per conversation. Their interface priority is CLI → Direct API → GraphQL → curl → MCP. We're keeping both, but: for our M5 Trigger.dev ingestion task we'll go straight to the REST API (their `trigger/lib/smartlead.ts` is the reference). MCP is for ad-hoc Claude-driven exploration; CLI is for our own scripted operations.
- **Positive-reply filter is numeric**: `GET /campaigns/{id}/leads?lead_category_id=1` returns "Interested" replies. `lead_category=Interested` (string) returns 400. (From `outbound` gotcha #10.) This is the filter M5's ingestion task should use.
- **MCP server repo archived 2026-02-03** by LeadMagic. It still works, but no upstream fixes are coming. If it bitrots, fall back to CLI/REST API.
- **Advanced MCP tools are off by default**. To unlock the other 64 tools: add `SMARTLEAD_ADVANCED_TOOLS=true` to the MCP env. We don't need them for this project.

## Reproducing this setup elsewhere

```powershell
# 1. Put the key in a .env at the repo root (or wherever)
# SMARTLEAD_API_KEY=...

# 2. Install the CLI globally
npm install -g @smartlead/cli

# 3. Add the MCP at user scope (one-time, for this Claude Code instance)
$env:SMARTLEAD_API_KEY = (Get-Content .env | Where-Object { $_ -match '^SMARTLEAD_API_KEY=' }) -replace '^SMARTLEAD_API_KEY=', ''
claude mcp add smartlead --scope user -e "SMARTLEAD_API_KEY=$env:SMARTLEAD_API_KEY" -- npx -y smartlead-mcp-by-leadmagic
```
