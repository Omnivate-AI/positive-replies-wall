# Positive Replies Wall

A public landing page that displays Omnivate's best positive cold-outbound replies — automatically captured from Smartlead, AI-classified for quality, and rendered as a wall of email reply cards with span-level redaction support.

[Strategy brief](brief.md) · [Project report](report.md) · [QA tickets](qa-tickets/) · Live: https://positive-repies-wall.vercel.app · Admin: https://positive-repies-wall.vercel.app/admin

---

## What this is

Omnivate runs AI-driven outbound campaigns for B2B clients. Across thousands of campaigns we get a steady stream of high-quality positive replies — prospects who write back complimenting the email, the angle, the personalization, or the sequence itself. This repo turns that signal into proof: a wall of real email replies on omnivate.ai that prospective clients (and our sales team) can point at as social proof.

**The pipeline:** Smartlead reply → Trigger.dev ingestion task → Supabase (`prw_replies`) → Trigger.dev classifier task (OpenRouter, `xiaomi/mimo-v2-flash`) → Supabase (`prw_classifications` with sub-scores + cleaned reply text) → Next.js wall reads `is_high_quality = true` and renders.

## Stack

| Layer | Tool |
|---|---|
| Web app | Next.js 16 (App Router) + Tailwind v4 + Google Sans + framer-motion |
| Hosting | Vercel (auto-deploy from `main`) |
| Database | Supabase Postgres (project `uivgowblojtyiobhgjlv`, shared with Omnivate's existing 117 tables — our 5 tables prefixed `prw_`) |
| Reply source | Smartlead (CLI primary, REST API in Trigger.dev tasks, MCP for ad-hoc) |
| AI | OpenRouter (`xiaomi/mimo-v2-flash`) for reply extraction + classification |
| Background tasks | Trigger.dev (project `proj_vdhufffmwghsuhddbqrd` — shared with `outbound`) |
| Tests | Vitest (4 buckets: unit / integration / e2e / smoke) |
| Lint | ESLint v9 (flat config) + eslint-config-next + typescript-eslint |

## Repo layout

```
.
├── app/                              Next.js App Router
│   ├── page.tsx                      Public wall (ISR=60). Reads getPublishedWallThreads.
│   ├── layout.tsx                    Root metadata + Google Sans <link>
│   ├── error.tsx                     Global error boundary; emits event=page_render_failed
│   ├── globals.css                   Tailwind v4 tokens + redaction styles
│   ├── icon.ico
│   ├── admin/
│   │   ├── page.tsx                  Server-rendered admin shell
│   │   └── dashboard.tsx             Client triage UI (filter / preview / mutate)
│   ├── auth/
│   │   ├── page.tsx                  Sign-in placeholder (visual only — see m10 doc)
│   │   └── login-form.tsx            Client form (no-op submit; auth deferred to main-app integration)
│   └── api/
│       └── admin/
│           ├── publish/route.ts      POST is_published / display_priority
│           ├── redactions/route.ts   POST + DELETE (admin-source only)
│           ├── highlights/route.ts   POST + DELETE (admin-source only)
│           └── revalidate/route.ts   POST revalidatePath('/')
├── components/
│   ├── email-reply-card.tsx          Shared code-rendered email card; renders the wall + admin preview
│   └── wall-grid.tsx                 Public wall column layout + client-side "show more" reveal
├── lib/                              Server-side utilities
│   ├── supabase-public.ts            Anon-key client + queries (wall, admin, stats)
│   ├── supabase-admin.ts             Service-role client (admin API mutations only)
│   ├── redactions.tsx                applyRedactions + inferMatchType (literal vs word_boundary)
│   ├── excerpt.ts                    Body truncation around the anchor highlight
│   └── sdr.ts                        SDR first-name allowlist (defense-in-depth redaction set)
├── trigger/                          Trigger.dev tasks
│   ├── ingest-smartlead-replies.ts
│   ├── classify-replies.ts
│   ├── scheduled-ingest-and-classify.ts  Daily wrapper (ingest → classify)
│   ├── lib/                          smartlead, classify, classify-batch, openrouter, retry, supabase, mappers, ingest, lead-lookup
│   └── prompts/
│       └── classify-reply.md         The classifier prompt — externalised so non-engineers can iterate
├── migrations/                       Supabase schema migrations
│   ├── 001-positive-replies.sql      prw_* tables
│   ├── 002-classifier-cleaned-reply.sql
│   ├── 003-restructure-threads.sql   prw_threads + prw_messages restructure
│   ├── 004-prw-highlights.sql        Multi-highlight schema
│   └── 005-redaction-word-boundary.sql  Backfill match_type for auto_lead rows
├── scripts/                          Local CLI runners
│   ├── ingest-local.ts               Pull positive replies from Smartlead → Supabase
│   ├── classify-local.ts             Score unclassified replies via OpenRouter
│   ├── run-calibration.ts            M4 exemplars + junk control test against the prompt
│   ├── apply-migration.ts            Apply a migration file to the linked Supabase project
│   ├── test-deployment.ts            Smoke-test deployed Trigger.dev tasks
│   └── trigger-wrapper.ts            CLI helper for running a Trigger task locally
├── tests/                            Vitest suites — unit / integration / e2e / smoke (148 tests)
│   └── _helpers/                     Fixtures (M2 Smartlead + M4 exemplars + junk replies)
├── qa-tickets/                       Structured findings from the QA reviewer agent
├── docs/                             Per-milestone deliverables (m1 through m11) + the M11 runbook
│   └── m4-exemplars/                 Original Omar-flagged screenshots (Option A reference)
├── .claude/
│   ├── agents/qa-reviewer.md         Senior QA reviewer agent
│   └── skills/frontend-engineer/     Frontend discipline skill (auto-activates on FE work)
├── trigger.config.ts                 Trigger.dev project config
├── next.config.ts                    Next.js config + image remotePatterns
├── postcss.config.mjs                Tailwind v4 PostCSS plugin
├── eslint.config.mjs                 ESLint flat config (v9) — full source tree linted
├── vitest.config.ts                  Vitest config
├── tsconfig.json                     TypeScript strict mode + `@/*` paths
├── brief.md                          The original 11-mini-project project brief from Omar
└── report.md                         Project report — what we built, lessons, plan
```

## Local development

### Prerequisites
- Node.js 20+
- A `.env` at the repo root with:
  ```
  SMARTLEAD_API_KEY=...
  SUPABASE_URL=https://uivgowblojtyiobhgjlv.supabase.co
  SUPABASE_ACCESS_TOKEN=sbp_...        # personal access token, for migrations + management
  SUPABASE_SERVICE_ROLE_KEY=eyJ...     # used by Trigger.dev tasks for writes
  SUPABASE_ANON_KEY=eyJ...             # used by the Next.js app for public reads
  OPENROUTER_API_KEY=sk-or-...
  TRIGGER_SECRET_KEY=tr_prod_...
  VERCEL_TOKEN=...                      # CLI deploys
  ```

### Run the Next.js app
```bash
npm install
npm run dev          # http://localhost:3000
```

### Tests + lint
```bash
npm test              # all 4 buckets, ~70s
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:smoke
npm run typecheck
npm run lint
npm run lint:fix
```

### Trigger.dev tasks (local)
```bash
npm run ingest:local                              # pull all Smartlead positive replies → Supabase
npm run ingest:local -- --campaign-id 2851748     # one campaign
npm run classify:local                            # classify unclassified replies at current PROMPT_VERSION
npm run classify:local -- --reply-id 196,207      # specific replies
npm run calibration:m4                            # run M4 exemplars + junk through the prompt
```

### Trigger.dev tasks (deployed)
```bash
npm run trigger:dev      # local dev runtime that proxies to deployed code
npm run trigger:deploy   # deploy task definitions to Trigger.dev (proj_vdhufffmwghsuhddbqrd)
```

### Supabase migrations
```bash
npm run db:migrate       # apply all migrations/*.sql via supabase CLI
npm run db:diff          # diff local vs remote schema
```

## Deploy

The Vercel project is wired to auto-deploy on every push to `main`:
1. Push to `Omnivate-AI/positive-replies-wall` main branch
2. Vercel builds the Next.js app
3. Live at https://positive-repies-wall.vercel.app

Manual deploy: `vercel --prod --yes --scope emmanuel-2239s-projects` (rare; only for hotfixes outside the git flow).

Trigger.dev redeploy after editing tasks or the prompt:
```bash
npx trigger.dev@4.4.5 deploy
```

## Status — milestones

| | Status |
|---|---|
| M1 Tool stack primer | ✅ ([docs/m1-tool-stack-primer.md](docs/m1-tool-stack-primer.md)) |
| M2 Smartlead access | ✅ ([docs/m2-smartlead-setup.md](docs/m2-smartlead-setup.md)) |
| M3 Vercel + GitHub integrations | ✅ ([docs/m3-vercel-github-setup.md](docs/m3-vercel-github-setup.md)) |
| M4 Quality bar calibration | ✅ ([docs/m4-quality-bar-calibration.md](docs/m4-quality-bar-calibration.md)) |
| M5 Supabase data pipeline | ✅ ([docs/m5-data-pipeline.md](docs/m5-data-pipeline.md)) — 339 replies ingested |
| M6 AI classification | ✅ ([docs/m6-classification.md](docs/m6-classification.md)) — at PROMPT_VERSION v1.2; acceptance #4 closed |
| M7 Rendering strategy | ✅ ([docs/m7-rendering-strategy.md](docs/m7-rendering-strategy.md)) — Option B picked |
| M8 Initial landing page deploy | ✅ ([docs/m8-initial-deploy.md](docs/m8-initial-deploy.md)) |
| M9 Email rendering component | 🚧 next |
| M10 Wiring + admin | ⏳ |
| M11 Continuous operations | ⏳ |

## Conventions worth knowing

- **Smartlead always via CLI**, MCP only as fallback (saved as durable feedback in `memory/`). The MCP loads 49+ tools and burns 50-80K tokens per conversation; CLI is faster and cheaper.
- **AI classification is two-stage**: extract clean reply text + score against the M4 rubric. The cleaned text is the source of truth for what the wall renders — exactly what the AI scored on.
- **Bumping `PROMPT_VERSION`** in `trigger/lib/classify.ts` triggers a full re-classification on the next batch run (UNIQUE constraint on `(reply_id, prompt_version)` means old scores stay queryable for diff analysis).
- **No truncation on the wall** — replies render in full per M4 policy. Skeptic-concession replies only land with their preamble intact.
- **Sort by reply timestamp**, not score. Quality is a binary publish gate; recency reads more honestly than ranking.

## Owner

Project initiated and owned by Omar Almubarak; engineering by Emmanuel.
