# M3 — Vercel and GitHub Claude Code integrations

Wired up GitHub and Vercel access from Claude Code via both **CLI** (the daily driver, per the rule we set in M2) and **MCP** (per the brief, available as fallback for tasks the CLI can't do).

## What was installed

| Interface | Source | Auth |
|---|---|---|
| GitHub CLI (`gh`) | already installed (v2.92.0); re-auth'd via `gh auth login --web` | OAuth, token stored in `gh` keyring |
| GitHub MCP | `npx -y @modelcontextprotocol/server-github` (stdio) | `GITHUB_PERSONAL_ACCESS_TOKEN` (sourced from `gh auth token` at install time) |
| Vercel CLI (`vercel`) | `npm install -g vercel` | OAuth via `vercel login` |
| Vercel MCP | `https://mcp.vercel.com` (HTTP, official) | Bearer token from `.env` (`VERCEL_TOKEN`) |

Both MCPs are at **user scope** (`~/.claude.json`), same pattern as Smartlead — available across every Claude Code project on this machine, not just `positive-replies-wall`.

## Verifications (live commands)

```
$ gh api user --jq '.login + " / " + .name'
emmanuel-omnivate / Emmanuel

$ gh api user/orgs --jq '.[].login'
Omnivate-AI

$ gh repo list Omnivate-AI --limit 5
Omnivate-AI/omnivate-ai-outbound  (private)
Omnivate-AI/ColdIQ-s-GTM-Skills   (public, fork)
```

```
$ vercel whoami
emmanuel-2239

$ vercel teams ls
emmanuel-2239's projects   (only team)

$ vercel projects ls
No projects found yet (positive-replies-wall will live here after M8)
```

```
$ claude mcp list
smartlead: npx -y smartlead-mcp-by-leadmagic — ✓ Connected
vercel:    https://mcp.vercel.com (HTTP)     — ✓ Connected
github:    npx -y @modelcontextprotocol/server-github — ✓ Connected
```

The MCP tools become callable in the next Claude Code session (MCPs load at session start).

## Gotcha worth recording

**The `https://api.githubcopilot.com/mcp/` GitHub MCP requires a paid Copilot subscription.** That's the URL the Omnivate production `.mcp.json` uses (and the LeadMagic-style hosted GitHub MCP). Without Copilot, it returns HTTP 403 on every call. For accounts without Copilot — like `emmanuel-omnivate` here — the `@modelcontextprotocol/server-github` stdio package is the right choice. It uses plain GitHub REST API auth and does not require Copilot.

If Omnivate wants Copilot-MCP parity later, the upgrade is: add Copilot to the seat, switch the MCP entry to the HTTP transport at `api.githubcopilot.com`, no code changes needed.

## Day-to-day usage

Per the M2 rule (saved in memory): default to the CLI, reach for the MCP only when the CLI can't do something.

**GitHub:**
- `gh repo list <org>` / `gh repo create` — repo management
- `gh pr create` / `gh pr view <num>` / `gh pr checks` — PR work
- `gh api <endpoint>` — anything REST-shaped
- MCP fallback: when an agent needs to chain repo ops mid-conversation without shelling out

**Vercel:**
- `vercel deploy` / `vercel logs` / `vercel env` — deployment + env
- `vercel projects ls` / `vercel domains ls` — inventory
- MCP fallback: when an agent needs structured access to deployment/build state mid-conversation

## For the M3 Loom

Run from a fresh restart so the MCPs show in the in-session tool list. Demo flow:

1. `claude mcp list` (show all three connected)
2. `gh repo list Omnivate-AI --limit 5` (live GitHub call)
3. `vercel projects ls` (live Vercel call)
4. One MCP call each — e.g., the GitHub MCP's `list_repos` and Vercel MCP's `list_projects` — to satisfy the brief's "MCP responds correctly to live commands" check.
