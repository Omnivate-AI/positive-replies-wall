# Positive Replies Wall: Project Brief

Owner: Omar Almubarak
Last updated: 2026-05-03
Status: Brief, awaiting kickoff

## 1. Purpose

Omnivate AI runs AI driven outbound campaigns for B2B clients. Across our campaigns we get a steady stream of high quality positive replies: prospects who write back complimenting the email, the angle, the personalization, or the sequence itself. These replies are the strongest social proof we have.

We want a beautifully designed public landing page that displays our best positive replies to anyone visiting our website. The page should look like a wall of real email replies, complete with sender block, subject line, and body, all rendered in a way that feels authentic and credible. As new high quality replies come in, they should be automatically captured, scored for quality, and added to the page.

The page does two things at once. It proves to prospective clients that Omnivate's outbound actually works, with real evidence rather than vague claims. It also gives our sales team a link they can drop into any conversation as instant credibility.

This brief breaks the project into eleven mini projects across five phases. Each mini project has its own context, requirements, acceptance criteria, and final deliverable. Phases are gated. Do not move to the next phase until the current one is signed off.

## 2. Background context (read this first)

If you have not worked on AI outbound before, here is the minimum you need to know.

AI outbound is the practice of sending personalized cold emails at scale. Omnivate runs hundreds of campaigns across many B2B clients. Every campaign sends thousands of emails. A small percentage of recipients reply, and a small percentage of those replies are highly positive ("this is the best cold email I've received in years," "love the angle," "great sequence, who wrote this?"). These are the ones we want to show off.

The replies live inside **Smartlead**, the cold email platform we use for all sending. Smartlead has a unified inbox where every reply across every campaign across every client lands. Smartlead has an API and an MCP server, which means we can pull replies programmatically.

The interesting work in this project is twofold. First, classifying replies: out of every positive reply, which ones are genuinely complimentary about the outreach itself (not just a polite "no thanks")? That is an AI classification task. Second, rendering: how do we display these replies on a webpage in a way that feels real and credible without making the design ugly?

### Why authenticity matters for the rendering choice

A page that just shows quotes in clean typography ("This is a great email!") is not credible. Anyone could write that. A page that shows actual screenshots of email replies is credible because the recipient knows screenshots are hard to fake convincingly. The downside of screenshots is they look inconsistent, are hard to design around, and require us to take and host an image for every reply.

A third option is to recreate the look of an email reply in code, including the sender block, subject line, message body, and any quoted thread below. This gets us the "looks like a real email screenshot" credibility at design quality consistent with the rest of our site, and avoids the operational pain of hosting hundreds of images.

The default lean for this project is the third option, but the engineer must build small proofs of concept of all three approaches in Phase 3 and recommend one before committing.

### Redaction

When we display replies publicly, we cannot show personally identifiable information like sender names and company names. But we also do not want to simply delete that text, because the visible presence of redaction (like a black bar drawn over censored text in a classified document) is part of what makes the page feel like a real email rather than a sanitized testimonial. The original sender wrote real words; we are just covering the sensitive parts.

The site must therefore support span level redaction. Specific words or phrases marked sensitive get visually obscured by a solid black bar at render time, while the underlying text remains intact in the database (so we can change our minds later, or unredact for an internal preview). The visual effect should mimic the look of a redacted government document: a clean black rectangle the same height as the surrounding text, with no shimmer of the underlying text bleeding through.

The admin tooling must let Omar mark which words or phrases to redact per reply. This is a core feature, not a nice to have.

The full glossary is at the end of this document. Read it before starting Mini Project 1.

## 3. Reference examples

Two artifacts to study before doing anything else.

**The "wall of love" pattern.** Search "wall of love" plus B2B SaaS landing pages. Look at sites like Senja.io's wall examples, Testimonial.to galleries, ConvertKit's testimonial pages, and Cluely's testimonial wall (these are well known examples; if any are unreachable, find adjacent ones). Note what makes a wall feel real versus generic. Most weak walls show plain text quotes in a card. Most strong walls show artifacts that look like the original message: tweets, screenshots, emails, Slack messages, with full sender context.

**Notion CRM examples of high quality replies.** Omar will give you access to the Omnivate Notion workspace. There is a CRM page where Omar has flagged specific replies as exemplars of the bar we want to hit. These are the gold standard for what "high quality positive reply" means. Read all of them carefully before designing the AI classifier in M6. The classifier's job is to find more of these.

## 4. Vision and build phases

The end state is a public page on omnivate.ai that displays our best positive replies, automatically updated as new replies come in, with sensitive information redacted in a way that preserves authenticity. To get there we ship in five phases.

**Phase 1: Foundations.** Four mini projects to learn the four tool stack we use at Omnivate, set up Smartlead access, wire Vercel and GitHub into your Claude Code instance, and calibrate on Omar's quality bar from the Notion CRM.

**Phase 2: Data pipeline.** Two mini projects to get all positive replies into Supabase (which involves checking what's already there and pulling fresh from Smartlead) and build the AI classifier that scores them.

**Phase 3: Rendering strategy.** One mini project where you build small proofs of concept for three rendering approaches and recommend one. The redaction requirement is part of the comparison.

**Phase 4: Landing page build.** Three mini projects to deploy a landing page on Vercel, build the email rendering component with redaction support, and wire it to Supabase with sorting and admin controls including span level redaction tooling.

**Phase 5: Continuous operations.** One mini project to schedule the ingestion and classification tasks so new replies are captured automatically, plus a monitoring runbook.

Do not skip ahead. Each phase is a real gate. Sign off comes from Omar.

### Per task Loom (applies to every mini project)

Every mini project ends with a Loom video. Once you finish the work and produce the deliverable, record yourself walking through what you produced. Target five minutes per Loom. Open the file (or the live demo, or the running pipeline, or the deployed page) on your screen and explain what is in it, what you found, and how it feeds into the next mini project. Share the Loom URL with Omar via Slack as soon as you finish each mini project.

The Loom is part of the mini project's final deliverable, not optional. Omar reviews each Loom before the mini project is considered signed off. Do not start the next mini project until you have shared the Loom for the previous one.

## 5. Working constraints

**One engineer** owns this project end to end.

**Tool stack:**

* Claude Code (your development environment).
* Trigger.dev (background task orchestration; ingestion and classification run here).
* OpenRouter (all AI calls; default model is `xiaomi/mimo-v2-flash`, do not change without explicit permission).
* Supabase (Postgres database). You will need access to the existing Omnivate project (`uivgowblojtyiobhgjlv`); Omar will help you get connected.
* Smartlead (cold email platform; source of all replies, has MCP and API). Omar will provide credentials.
* Notion (where Omar's flagged exemplar replies live; access via MCP).
* Vercel (landing page hosting).
* GitHub (source control for the landing page repo).

**Framework choice for the landing page is yours.** Use whatever you are fastest in (Next.js, Astro, Nuxt, SvelteKit, plain HTML and Vite, anything Vercel supports). The brief specifies outcomes, not implementation details. Deliver a landing page that looks great, hits performance targets, and can be deployed and iterated on quickly.

**Cost rules.** Pay as you go is best. Low monthly subscriptions are acceptable. Avoid tools with subscriptions over a few hundred dollars per month unless the business case is overwhelming.

**Authenticity.** Whatever rendering approach you choose, the page must feel real. If a visitor cannot tell at a glance whether the replies are screenshots or rendered code, that is the success bar. Generic testimonial cards with stylized quotes are not acceptable.

**Privacy via redaction.** The rendering and admin layers must support span level redaction as described in section 2. The original text always stays intact in Supabase; only the rendered output is obscured. Redaction is a visible black bar, not a deletion.

## 6. Project folder structure

You will create a single GitHub repository for this project. Suggested name: `positive-replies-wall`. The repo gets pushed to GitHub and connected to Vercel for automatic deployment.

The exact folder layout depends on the framework you pick. The repo should contain (in some shape):

* `docs/` for knowledge work and decision documents from this brief.
* `trigger/` for Trigger.dev tasks (ingestion and classification).
* `migrations/` for any Supabase migrations you write.
* The landing page source code in whatever layout your chosen framework expects.
* A README at the repo root describing the project, how to run it locally, and how to deploy.

All file paths in the rest of this brief are written as logical names (for example "the rendering component" or "the admin page"). Translate to the appropriate path in your chosen framework.

## 7. Mini projects

Every mini project has the same shape: Why this matters, Requirements, Acceptance criteria, Final deliverable. The Loom video described in section 4 is part of every Final deliverable. Do the mini projects in order.

---

### Phase 1: Foundations

#### M1. The four tool stack primer

**Why this matters.** Almost everything Omnivate builds runs on the same four tool stack: Claude Code, Trigger.dev, OpenRouter, and Supabase. Before building anything, get a working understanding of what each tool is and how they fit together at Omnivate.

**Requirements.**

1. Visit each tool's website and skim the marketing or product page enough to know what it is and what it is for:
   * Claude Code: https://claude.com/product/claude-code (or https://code.claude.com/docs)
   * Trigger.dev: https://trigger.dev
   * OpenRouter: https://openrouter.ai
   * Supabase: https://supabase.com
2. Use Claude Code to query the Omnivate AI Outbound repository (Omar will give you access). Ask Claude Code questions like "how does Omnivate use Trigger.dev?", "show me an example of an OpenRouter call from a Trigger.dev task", "how does Omnivate connect to Supabase?", "what conventions does the team follow when building tasks?". The answers come from real production code in the repo. Use the `Explore` subagent if it speeds up your search.
3. Write a primer document covering: what each tool is in your own words (one short paragraph each), and how the four tools fit together at Omnivate (one short section). Keep it concise. The goal is to prove you know enough to be dangerous, not to write a textbook.

**Acceptance criteria.**

1. The primer is in your own words, not pasted from docs.
2. It accurately describes how Omnivate strings the four tools together (data flows from where to where, AI calls happen at which step, etc).
3. It is short. One page is plenty.

**Final deliverable.**

1. A markdown file at `docs/m1-tool-stack-primer.md`.
2. A five minute Loom walking through your primer and the queries you ran against the repo. Share the URL with Omar via Slack.

---

#### M2. Smartlead MCP setup

**Why this matters.** Smartlead is the source of every reply this project depends on. You need a working Smartlead connection from your Claude Code instance before you can do anything in Phase 2.

**Requirements.**

1. Get Smartlead MCP credentials from Omar.
2. Add the Smartlead MCP server to your Claude Code configuration. Verify the connection by listing available Smartlead tools in Claude Code.
3. Run a quick smoke test: list a few clients with `get_all_clients`, list campaigns for one of them, fetch a small page of replies. Confirm everything responds with real data.

**Acceptance criteria.**

1. The Smartlead MCP is wired and works end to end from your Claude Code instance.
2. You can demonstrate live MCP queries returning real data.

**Final deliverable.**

1. The Smartlead MCP configured in your local Claude Code setup.
2. A five minute Loom showing live Smartlead MCP queries from Claude Code: list clients, list a campaign's replies, briefly explain what fields look interesting for our use case. Share the URL with Omar via Slack.

---

#### M3. Vercel and GitHub Claude Code integrations

**Why this matters.** You will deploy the landing page to Vercel from a GitHub repo and iterate on it dozens of times. The Vercel and GitHub MCPs in Claude Code let you create the repo, push commits, deploy, read build logs, and check runtime errors without leaving the editor. Wire them up before you write a line of landing page code.

**Requirements.**

1. Configure the GitHub MCP in your Claude Code instance. Verify with a small command (list your repos or similar).
2. Configure the Vercel MCP in your Claude Code instance. Verify with a small command (list your Vercel projects or similar).

**Acceptance criteria.**

1. Both MCPs respond correctly to live commands.
2. You can use them from Claude Code without falling back to a browser or terminal.

**Final deliverable.**

1. Both MCPs configured in your Claude Code setup.
2. A five minute Loom showing live commands against each MCP. Share the URL with Omar via Slack.

---

#### M4. Notion CRM quality bar calibration

**Why this matters.** Whatever AI classifier you build in M6 will only be as good as your understanding of "what counts as a high quality positive reply." Omar has flagged exemplars in the Omnivate Notion workspace. Read every single one before you build anything, because the classifier prompt is going to depend on it.

**Requirements.**

1. Get Notion access from Omar (the Notion MCP should already be wired in your Claude Code instance, but confirm).
2. Locate the Notion CRM page Omar points you to. Read every flagged reply.
3. For each exemplar, capture in a working spreadsheet or markdown table:
   * The reply text (or a sanitized excerpt).
   * What specifically makes it a high quality reply (the angle, the compliment, the depth, the curiosity).
   * What category it falls into (compliment on the email itself, compliment on the personalization, organic curiosity, request for more info, etc).
4. Synthesize a definition of "high quality positive reply" in your own words, with at least three categories and clear inclusion and exclusion rules.
5. Find five borderline replies (yours or in the Notion CRM) and reason out loud why each one is in or out. This sharpens the rules.
6. Translate the definition into a draft scoring rubric (zero to one hundred) covering: how complimentary is it, how specific is the praise, how senior is the sender, how publicly shareable is it after redaction.

**Acceptance criteria.**

1. Every flagged exemplar is read and categorized.
2. The definition has at least three categories with explicit rules.
3. Five borderline cases are reasoned through.
4. The scoring rubric is concrete enough that two people scoring the same reply would land within ten points of each other.

**Final deliverable.**

1. A markdown file at `docs/m4-quality-bar-calibration.md` containing the definition, categories, borderline reasoning, and scoring rubric.
2. A five minute Loom walking through three real exemplars from the Notion CRM, the definition you wrote, and your scoring rubric. Share the URL with Omar via Slack.

---

### Phase 2: Data pipeline

#### M5. Get all positive replies into Supabase

**Why this matters.** Every step downstream depends on having the full set of positive replies sitting in Supabase, ready to be classified, edited, redacted, and rendered. We don't know yet what's already in Supabase, so the first move is checking, then filling the gaps.

**Requirements.**

1. Get Supabase access from Omar. Connect to the existing Omnivate project (`uivgowblojtyiobhgjlv`) from your Claude Code instance using the Supabase MCP. If you hit any access trouble, speak to Omar before going further.
2. Query Supabase to see what reply data already exists. List tables, look for anything related to inboxes, replies, or Smartlead. Document what you find.
3. Decide whether existing data is sufficient or whether we need to pull fresh from Smartlead. The expectation is that we will need fresh data; confirm by inspection.
4. Use Claude Code to query Smartlead via MCP and extract every positive reply across every client and every campaign. "Positive reply" starts as everything Smartlead has tagged `lead_category_id = 1` ("Interested"); refine with Omar if you find that net is too wide or too narrow.
5. Design and apply a Supabase migration for the tables you need. At minimum the schema must support:
   * The full reply payload (sender info, subject, body, timestamps, unibox URL, the Smartlead lead and campaign and client IDs, the raw Smartlead JSON for safety).
   * AI classification output (high quality flag, score, category, reasoning, prompt version) tied to each reply.
   * Publish state per reply (whether it's live on the page, the display priority, who edited it, when).
   * **Redactions** per reply: a way to mark specific spans of text in the body as sensitive so the rendering layer can obscure them. Keep the original body untouched. The simplest shape is an array of strings to redact per reply; a more precise shape is an array of `{start, end}` offsets. Pick one and document why.
6. Write the ingestion as a Trigger.dev task (so we can re run it later). Follow the patterns you saw in M1's repo exploration. The task must be safely re runnable: running twice does not produce duplicates.
7. Run the full backfill end to end. Capture the total reply count.

**Acceptance criteria.**

1. Supabase access works. You can query and write from Claude Code.
2. Existing Supabase reply data is documented (what's there, gaps).
3. Schema applied and supports raw replies, classifications, publish state, and redactions.
4. Ingestion task runs end to end without errors and is re runnable without duplicates.
5. Reply counts match what Omar can sanity check against the Smartlead UI.

**Final deliverable.**

1. The migration at `migrations/001-positive-replies.sql` (or similar).
2. The ingestion task at `trigger/ingest-smartlead-replies.ts`.
3. A short readme at `docs/m5-data-pipeline.md` documenting what you found in Supabase, the schema you applied, how the ingestion task works, and the total backfilled count.
4. A five minute Loom showing the schema, the task running (or a recent run), and a query against Supabase showing the rows landed. Share the URL with Omar via Slack.

---

#### M6. AI classification and scoring

**Why this matters.** Most replies sitting in Supabase are not high quality enough to publish. The classifier separates the wheat from the chaff and scores each reply so the landing page knows which to feature.

**Requirements.**

1. Build a Trigger.dev task at `trigger/classify-replies.ts`.
2. The task processes any reply in the replies table that does not yet have an associated classification row.
3. For each reply, call OpenRouter (model `xiaomi/mimo-v2-flash`) with a goal driven prompt grounded in M4's quality bar calibration. The prompt must:
   * Take the reply body as input.
   * Decide whether it is high quality (yes or no).
   * Score zero to one hundred against the M4 rubric.
   * Pick a category from M4's category list.
   * Produce a short reasoning string explaining the decision.
4. Use Omnivate's standard goal driven prompt format (objective, input, output, ten to fifteen good examples drawn from your M4 work, rejection examples, bad examples, minimal rules). If you don't already know that pattern, ask Claude Code to explain it from the repo.
5. Write the classification result back to Supabase, including the prompt version (so we can re classify later if the prompt changes).
6. Test the prompt iteratively on the M4 exemplars before running it at scale. The classifier must label all of Omar's flagged exemplars as high quality, and label at least three obvious junk replies as not high quality.
7. Once the prompt passes the calibration test, run the classifier across the full backfill from M5.

**Acceptance criteria.**

1. Calibration test: 100% of M4 exemplars classified as high quality.
2. Junk control: at least three obvious "polite no thanks" replies classified as not high quality.
3. Full backfill classification runs without errors.
4. Spot check by Omar on at least twenty random classifications agrees with the model on at least eighteen of them.

**Final deliverable.**

1. The Trigger.dev task at `trigger/classify-replies.ts`.
2. The prompt extracted to a separate file (e.g. `trigger/prompts/classify-reply.md`) so Omar can edit it without touching code.
3. A five minute Loom walking through the prompt, showing live classification on three replies (one obvious yes, one obvious no, one borderline), and showing the rows that landed in Supabase. Share the URL with Omar via Slack.

---

### Phase 3: Rendering strategy

#### M7. Rendering strategy feasibility study

**Why this matters.** This is the design fork in the road. Get it wrong and the landing page either looks generic or becomes operationally painful. The redaction requirement also constrains what's feasible. Build small proofs of concept before committing.

**Requirements.**

1. Build three small proofs of concept, each rendering the same three example replies side by side:
   * **Option A: actual screenshots.** Figure out how to programmatically take screenshots of replies in the Smartlead UI. Investigate Playwright, Puppeteer, dedicated screenshot APIs, or manual capture. Render the screenshots as images on a webpage. Document the operational cost, and how redaction would work (you would have to draw black rectangles on each image, or recapture the screenshot after editing the source).
   * **Option B: code rendered email recreation.** Render an email card in code that visually mimics a typical email client (avatar, sender block, subject, body, timestamp, optionally a quoted thread). Pull the data from Supabase. The redaction implementation is straightforward: any flagged span gets wrapped in a styled element that draws a black bar over it.
   * **Option C: hybrid.** Render the email as code, then use a runtime image library (Vercel OG, Satori, headless Chromium, or similar) to capture it as an image at request time. The output is an image, but the source is still data, so updates and redactions are programmatic.
2. Compare the three on these dimensions: visual quality, perceived authenticity, design consistency, operational cost per new reply, time to first render for a visitor, **how cleanly redaction is supported**, ability to update content after the fact, accessibility (screen readers).
3. Recommend one. If Omar's lean (Option B) holds up under the comparison, recommend B with reasoning. If your POCs reveal a problem with B, recommend an alternative with reasoning.

**Acceptance criteria.**

1. All three POCs render the same three example replies, with redaction applied to at least one span in each.
2. Each POC has an honest writeup of pros and cons grounded in your actual implementation.
3. The recommendation is concrete and actionable, with clear reasoning.

**Final deliverable.**

1. A folder at `docs/m7-pocs/` with the three POC implementations.
2. A markdown file at `docs/m7-rendering-strategy.md` with the comparison and recommendation.
3. A five minute Loom showing all three POCs side by side rendering the same redacted replies, walking through your comparison, and stating your recommendation with reasoning. Share the URL with Omar via Slack.

---

### Phase 4: Landing page build

#### M8. Initial landing page deploy

**Why this matters.** Get an empty page on a real Vercel URL before writing the rendering code. That way you spend the rest of Phase 4 iterating on a live deployment loop, not fighting infrastructure.

**Requirements.**

1. Create the production GitHub repo for this project. Suggested name: `positive-replies-wall`. Push the initial scaffold using whichever framework you choose.
2. Connect Supabase to the repo so the page can read live data.
3. Connect the repo to Vercel. Configure environment variables.
4. Deploy a placeholder page that just shows a title ("Positive Replies, coming soon") and a count of total positive replies pulled live from Supabase.
5. Confirm the page is live at a Vercel URL.
6. Discuss with Omar whether to assign a custom subroute on omnivate.ai now or at launch in M10.

**Acceptance criteria.**

1. The repo exists on GitHub.
2. The page is live on a Vercel URL.
3. The page reads from Supabase and shows the live count.
4. Pushes to the main branch deploy automatically.

**Final deliverable.**

1. The GitHub repo URL.
2. The live Vercel URL.
3. A five minute Loom showing the page live, the deploy pipeline running on a small commit, and the live count refreshing. Share the URL with Omar via Slack.

---

#### M9. Email rendering component with redaction

**Why this matters.** This is the core UI of the entire project. The component takes a reply from Supabase and renders it on the page in the format M7 recommended, with redactions visually obscured. Quality here makes or breaks the credibility of the whole page.

**Requirements.**

1. Implement the rendering recommendation from M7 as a reusable component.
2. The output must include every visual element a viewer would expect of a real email reply: sender name and email, sender company or role if present, subject line, sent or reply timestamp, body with preserved line breaks, and a sender avatar (use Gravatar, Logo.dev, DiceBear, or similar to fetch a likeness automatically).
3. **Redaction rendering.** For each redaction stored on a reply, the corresponding text in the rendered output is covered by a solid black rectangle the same height as the surrounding text. The black rectangle must look like a redaction bar in a classified document: clean, opaque, and obviously deliberate. The original text is still in the database; only the rendered output is obscured. The redacted span should still occupy the right amount of horizontal space (so the surrounding text flows naturally as if the words were there).
4. Handle long bodies gracefully (truncation with a "show more" expand, or clean overflow).
5. Handle missing fields gracefully (fall back without breaking the layout).
6. Build a static demo page at `/demo` that renders ten of M4's exemplars with hand authored redactions, so the visual design can be reviewed independently of the live data path.
7. Decide on dark mode, light mode, or both with Omar's approval.
8. Mobile, tablet, desktop must all look clean.

**Acceptance criteria.**

1. The component renders all ten demo replies cleanly with no broken layouts.
2. Redactions render as clean black bars that look like a real classified document, not a partial or shimmery cover.
3. A friend looking at the page on their phone cannot tell at a glance whether it is a screenshot or rendered code.
4. Omar approves the visual design before M10 begins.

**Final deliverable.**

1. The rendering component in the repo.
2. The demo page at `/demo` showing the ten exemplars with redactions applied.
3. A five minute Loom walking through the demo page on desktop and mobile, showing the component handling long bodies, missing fields, and redactions. Share the URL with Omar via Slack.

---

#### M10. Landing page wiring, sorting, and admin (with redaction tooling)

**Why this matters.** With the rendering component done, build the actual landing page that pulls live data, sorts it, and gives Omar enough control to curate what shows and to mark redactions per reply.

**Requirements.**

1. Build the public landing page at `/` (or whichever route Omar approves). It must:
   * Pull all replies that are marked published, joined to their classifications and redactions.
   * Sort by display priority ascending, then quality score descending, then reply timestamp descending.
   * Render each reply with the M9 component, redactions applied.
   * Handle empty states cleanly.
2. Build a simple admin page (gated behind a password Omar provides, or magic link auth, your choice). The admin page lets Omar:
   * See all replies (whether published or not), filterable by classification status.
   * Toggle published on or off per reply.
   * Edit display priority to bump a reply to the top.
   * **Mark redactions per reply.** Provide a clean way to select words or phrases in a reply's body and tag them as redacted. The tool must persist the redactions to Supabase. Reasonable approaches: a text editor with click and drag selection that adds the selection to a redactions list; a dedicated input where Omar types or pastes the words to redact; or both. Whichever you pick, it must be fast for Omar to use because he will redact dozens of replies.
   * Preview the reply with redactions applied before publishing.
3. Add a clean intro section at the top of the public page (one or two sentences explaining what visitors are seeing) and a footer CTA pointing to a "book a call" link.
4. Performance target: Time to First Byte under 800ms via static generation, incremental static regeneration, or edge caching.

**Acceptance criteria.**

1. The public page lists all currently published replies in the correct order, with redactions applied.
2. Omar can publish, unpublish, redact, preview, and reorder a reply from the admin page without touching SQL.
3. The redaction tool is fast enough that Omar can curate ten replies in ten minutes.
4. Page loads fast and looks polished.
5. Omar approves the page copy and overall design before launch.

**Final deliverable.**

1. The public page deployed to the production Vercel URL.
2. The admin page accessible to Omar.
3. A five minute Loom showing the public page with real published replies, the admin page in action (publishing, marking redactions on a reply, previewing, reordering), and the public page reflecting those changes. Share the URL with Omar via Slack.

---

### Phase 5: Continuous operations

#### M11. Continuous ingestion, scheduling, and runbook

**Why this matters.** Once the page is live, new positive replies arrive every day across our campaigns. The pipeline needs to capture and classify them automatically, and Omar needs a runbook so he can debug or recover when something breaks.

**Requirements.**

1. Schedule the M5 ingestion task to run on a regular cadence. Recommend hourly or every six hours depending on volume; confirm with Omar.
2. Schedule the M6 classification task to run shortly after ingestion (with a small delay to ensure new rows are present).
3. Add monitoring: a simple alert (email, Slack, or Trigger.dev's built in alerts) when either task fails twice in a row.
4. Write a runbook covering:
   * How to manually re run ingestion for a single client or campaign.
   * How to re classify all replies after editing the classifier prompt (bumping the prompt version).
   * How to remove a reply that should never have been published.
   * How to debug a reply showing the wrong sender info.
   * How to handle a Smartlead API outage gracefully.
   * How to rotate Smartlead, Supabase, OpenRouter credentials.
5. Document expected steady state cost per month based on real volume from the backfill.

**Acceptance criteria.**

1. Both scheduled tasks run on cadence and are visible in the Trigger.dev dashboard.
2. A test failure produces an alert that reaches Omar.
3. The runbook covers every bullet above and is concrete enough that a different engineer could pick it up cold.
4. Cost estimate is grounded in real numbers from the backfill, not a guess.

**Final deliverable.**

1. The scheduled tasks deployed to Trigger.dev.
2. A markdown file at `docs/m11-runbook.md` with the operational guidance.
3. A five minute Loom showing the scheduled tasks running in the dashboard, the alert flow being tested, and a walkthrough of the runbook. Share the URL with Omar via Slack.

---

## 8. Glossary

* **AI outbound.** The practice of running personalized cold email campaigns at scale, often using AI to write the copy.
* **Campaign.** A configured outbound sequence in Smartlead, sending a specific set of emails to a specific lead list on behalf of a specific client.
* **Reply.** Any inbound email from a recipient back to the sender of a campaign.
* **Positive reply.** A reply Smartlead has tagged as `lead_category_id = 1` ("Interested") or that is otherwise warm. The starting universe for our classifier.
* **High quality positive reply.** A positive reply that is also publicly worth showcasing: complimentary, specific, and credible. Defined precisely in M4.
* **Redaction.** Visually obscuring sensitive parts of a reply (names, company names) at render time using a solid black bar, while keeping the original text intact in the database. Modeled on the look of a redacted government document.
* **Smartlead.** Omnivate's cold email sending platform. Source of all replies.
* **Trigger.dev.** Background task orchestration platform. Where ingestion and classification run.
* **OpenRouter.** AI API gateway. Where all AI model calls go.
* **Supabase.** Postgres database with auth and APIs. Stores everything.
* **MCP.** Model Context Protocol. The protocol Claude uses to connect to external tools.
* **Wall of love.** The pattern of showcasing customer testimonials, replies, or social mentions densely on a single landing page.
* **Goal driven prompt.** Omnivate's standard AI prompt format: objective, input, output, ten to fifteen good examples, rejection examples, bad examples, minimal rules.

## 9. How to get help

* Direct questions to Omar via Slack.
* Use Claude Code to query the Omnivate AI Outbound repository whenever you need an example of how the team has solved a similar problem before.
* When stuck on Trigger.dev tasks, use the `trigger-dev-expert` subagent.
* When stuck on Supabase, use Claude Code to find the team's existing patterns or ask Omar.
* When stuck on Claude Code MCP setup, use the `claude-code-guide` subagent.
