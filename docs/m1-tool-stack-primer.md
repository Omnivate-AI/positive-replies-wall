# M1: Four-tool stack primer

The four tools Omnivate runs everything on, and how they fit together.

## The four tools

**Claude Code** is Anthropic's coding agent. It reads the repo, runs commands, edits files, and talks to external services through MCP servers. At Omnivate it isn't just a code editor — it's the *operator layer*. The human says "run pipeline 11 on batch 7" in plain English; Claude Code consults the Workflow Router in `CLAUDE.md`, loads the right skills + knowledge + client config + memory, executes the work (triggering jobs, querying the DB, calling APIs), monitors progress, and captures any new learnings back into the repo so the next session is strictly smarter than the last.

**Trigger.dev** is a cloud platform for running long-running TypeScript background jobs with full observability — logs, retries, durations, fan-out, all visible in a dashboard. At Omnivate it hosts the ~112 batch tasks that make up the pipeline. Each task does one thing (find an email via Prospeo, verify with MillionVerifier, qualify a title, generate a hook, etc.), and an orchestrator task walks each lead through the steps in order. This is the "workers on the line" of the factory metaphor.

**OpenRouter** is an API gateway that fronts dozens of LLM providers behind a single billing account and endpoint. At Omnivate, every AI call — qualification prompts, hook generation, subject lines, email bodies, QA grading, reply classification — goes through OpenRouter to `xiaomi/mimo-v2-flash`. That model choice is locked: it's the cheap-fast default that makes per-lead unit economics work at 25k-lead scale, and the brief is explicit it must not be changed without permission.

**Supabase** is a managed Postgres database with auto-generated REST APIs and a project dashboard. At Omnivate it's the *single source of truth* — every lead row, prompt, pipeline definition, mailbox record, run log, and KB entry lives in the existing project (`uivgowblojtyiobhgjlv`). Every pipeline step writes back four columns to the lead row (`{step}_result`, `_outcome`, `_status`, `_error`) so "ran but found nothing" is distinguishable from "failed and needs retry" — that's the 4-column pattern that makes the whole pipeline queryable and idempotent.

## How they fit together

Supabase is the substrate; everything else acts on it. A campaign starts when a CSV of raw leads is upserted into a per-client `{client}_leads` table. From there, Trigger.dev's orchestrator task walks every lead through the pipeline in two halves. **Stage 1** (enrich → verify → qualify) runs each lead through enrichment vendors and a qualification step — this is where one of the AI calls happens, with the qualification batch task hitting OpenRouter (`xiaomi/mimo-v2-flash`) and writing the result back to Supabase. **Stage 2** (personalise → QA → cross-campaign dedup → upload) generates hooks, subjects, and bodies — all via OpenRouter — and pushes the finished email into Smartlead for sending. Claude Code sits above this whole loop as the operator: the human triggers runs through it, it kicks off the Trigger.dev orchestrator, watches the dashboard, queries Supabase to debug, and at the end captures learnings into the right place (skill, knowledge doc, client folder, or memory).

For this project specifically, the same stack maps cleanly: Smartlead replies get pulled into Supabase by a Trigger.dev ingestion task (M5), classified by another Trigger.dev task that calls OpenRouter (M6), and rendered on a Next.js page that reads from Supabase (M8–M10). Claude Code is the harness I use to build, deploy, and operate every piece of that.
