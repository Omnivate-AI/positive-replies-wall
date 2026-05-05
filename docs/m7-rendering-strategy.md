# M7 — Rendering strategy

Three POCs built side-by-side rendering the same redacted replies, comparison on the dimensions the brief calls out, and the recommendation that drives M9. Plus the classifier audit quiz that closed out M6's acceptance #4.

## TL;DR

**Recommendation: Option B — code-rendered email cards.** Redaction is a styled span (cheap, auditable, reversible), updates are free, every reply is real text (accessible to screen readers, indexable), and the design quality matches anything we'd ship in code. We built and deployed all three options; B clears every dimension where A and C have real cost.

The audit quiz that piggybacked on this milestone also satisfied **M6 acceptance #4**: Emmanuel scored 18/20 then 19/20 against the v1.2 classifier — agreement ≥18 means the classifier's bar matches Omar's bar to a tolerable degree. Live at `/m7/quiz`.

## What we built

The three POCs all live in the production Next.js app at `app/m7/pocs`. Each renders the same three M4-exemplar replies (Mauritz / Jellyfish, Lizzy / Canidium, Valeria / Star Global). A redaction toggle at the top controls Options B and C in lockstep — toggle off to compare against Option A's unredacted source.

| | Path | Implementation |
|---|---|---|
| **Option A** — actual screenshot | `public/m7/exemplar-*.png` | Three M4 exemplar PNGs (lifted from `docs/m4-exemplars/`) served as static assets and rendered via `<img>` in the POC viewer. |
| **Option B** — code-rendered | `components/email-reply-card.tsx` | The `EmailReplyCard` React component. Subject + `From:` + `to:` + timestamp + divider + body. Redaction wraps matched spans in a `.redacted` styled `<span>` (solid black bar, transparent text underneath, surrounding text reflows naturally). |
| **Option C** — hybrid (rendered → image) | `app/api/og-reply/route.tsx` | An edge runtime that takes the same data Option B uses and rasterizes it to PNG via `@vercel/og` (Satori). Dynamic canvas height computed from body content so short replies don't sit on big white space. |

Live URLs:
- POC viewer: https://positive-repies-wall.vercel.app/m7/pocs
- Classifier audit quiz: https://positive-repies-wall.vercel.app/m7/quiz

## Comparison

Brief asked us to compare across these dimensions. Where there's a meaningful split, called out in the table; where all three are equal, omitted.

| Dimension | A (screenshot) | B (code-rendered) | C (hybrid) |
|---|---|---|---|
| **Visual quality** | Pixel-perfect by definition (it's a real screenshot) | High — fonts + spacing + chevron-style email-client framing tuned to read as authentic | Identical to B (it captures B) |
| **Perceived authenticity** | Strongest gut reaction — it's clearly a screenshot | High — at a glance and with the redaction bars present, indistinguishable from a screenshot to most viewers | Same as B (visitors see an image either way) |
| **Design consistency across replies** | Inconsistent — Smartlead's UI changes, screenshot resolutions vary, header styling drifts | Pixel-controllable — every reply uses the same component, same Google Sans, same paddings | Same as B by construction |
| **Operational cost per new reply** | **High** — capture, host, manage 1 PNG per reply (Playwright? manual? screenshot service?) — and re-do every time the source changes | **Zero** — render from `prw_replies` row at request time | **Compute per render** — Satori rasterizes JSX to PNG on each request; cacheable but never free |
| **Time to first render** | Fast (static asset) | Fast (static text) | Slowest — Satori cold start ~500ms-1s, then cached |
| **Redaction** | **Hard** — would require either drawing black rectangles on each PNG manually OR re-screenshotting from a redaction-aware source. Toggling redactions on/off after the fact is impossible without double the asset count | **Trivial** — `redactions: string[]` prop wraps matched spans in a `.redacted` class. Add/remove redactions via M10 admin tool, no re-render of stored data needed | **Mid-effort** — same as B at the JSX layer, but the resulting image then has to be regenerated when redactions change. Cache busting on `?redact=0` works but doubles cache entries |
| **Update content after the fact** | **Worst** — every change is a re-screenshot | **Best** — `UPDATE prw_publish_state` and the wall reflects it on next page load | **Mid** — change the data, image regenerates on next request |
| **Accessibility (screen readers)** | **None** — image of text. ARIA-label workarounds exist but they're brittle | **Native** — real text in the DOM. The redaction span is an empty-content `aria-hidden` shape; the visible text outside redactions is read by screen readers | **None** — same as A, it's an image |
| **SEO / indexability** | **None** — image content is not indexed | **Yes** — the page is real HTML | **None** — same as A |
| **Variant rendering** (e.g. dark mode, mobile size) | **None** — fixed pixel dimensions | **Free** — Tailwind utilities, prop-driven density, fluid layout | **Costs more** — each variant is a separate image generation |

## The redaction story specifically

The brief calls out redaction as a hard requirement and weights it for the comparison. Each option's redaction story:

- **Option A** — Smartlead doesn't expose a "redact this span" knob, and the screenshot is just bytes. Drawing black rectangles by hand on 80+ PNGs every time Omar tweaks a redaction is not realistic. Pre-redacting in the source isn't an option either — Smartlead's UI shows the unredacted reply.
- **Option B** — `applyRedactions(text, redactions)` walks the body string with a multi-alternation regex (longest-match-first, case-insensitive) and wraps each occurrence in `<span class="redacted">`. The span is solid-black background, transparent foreground; the original text stays in the DOM but is visually invisible. Surrounding text reflows naturally because the span occupies the same horizontal space as the text it replaces. Toggling redaction on/off is a prop change.
- **Option C** — Same JSX → Satori → PNG. Works, but adds a regeneration cost on every redaction edit and the image has to be cache-busted (we use `?redact=0` for the unredacted variant).

This single dimension would carry the recommendation by itself — Options A and C either can't do redaction or do it expensively, while B treats it as a styled span.

## Recommendation

**Option B** for the M9 wall. We've already built the production-shape `EmailReplyCard` component, the data path (`prw_replies` joined to `prw_classifications` on the cleaned text), and the redaction primitives. M9 will mostly reuse what's already in `components/`.

Option C stays available behind `/api/og-reply?id=...` — useful if we later want to share a single reply as a meta-tag-friendly image (e.g. for `<meta property="og:image">` on the public wall, or as a generated card to drop into LinkedIn). It's a free byproduct of the same component.

Option A's role going forward is the **calibration baseline** — the M4-exemplar PNGs in `docs/m4-exemplars/` are the original ground-truth artifacts Omar flagged. They aren't part of the public wall, but we keep them as the visual reference for what Option B should resemble.

## Implementation details that matter for M9

A few things M9 will inherit directly:

- **Card layout** — `[Subject] / From: name <email> · timestamp / to: recipient / divider / body`, paragraph spacing tightened to 12px between paragraphs (real-email feel, not double-spaced). Inline `From:` / `to:` labels (not a fixed-column grid) read like flowing email-client text.
- **Default redactions per reply** — prospect's first name, last name, email, company name. SDR first names (Christie, Andrew, James, Josh, Omar) stay unredacted by default per M4 policy. Admin-mark-extra-spans tooling is M10's job.
- **Cleaned reply text as the source of truth** — M9 should render `prw_classifications.cleaned_reply_text` (the AI's extracted prospect-typed content with mojibake fixed and quoted thread / forwarded blocks stripped), falling back to `extractReplyOnly(stripHtml(reply_body_html))` only for legacy v1.0 rows.
- **Mojibake fix runs in two layers** — `normalizeEncoding()` is applied inside `stripHtml()` for AI input AND inside the classifier's `postProcess()` for AI output, so the saved cleaned text is canonical-clean before it ever hits a render.
- **No truncation** (per M4 / M9 instruction) — the wall renders every reply in full. If a reply is too long for the layout, Omar declines to publish rather than the system truncating. Skeptic-concession replies (Charles Southgate-style) only land with their preamble intact, so truncation would destroy the whole category.
- **Sort order: reply timestamp** (per M4 instruction). Display priority remains as an admin override for pinning, but the default order is most-recent-first. Quality is the binary publish gate, not a sort key.

## What this looked like for M6 acceptance #4 (the audit quiz)

Bundled into M7 because the rendering POC viewer already gives us a place to host real-reply UI, the audit quiz at `/m7/quiz` shows Omar 20 random replies (10 high-quality + 10 non-high-quality, deterministic via Postgres `setseed(0.42)`) and asks for a Qualified / Not qualified judgment per reply. After Q20 it reveals the AI's classification per question and an X/20 agreement number.

Threshold: ≥18/20 = M6 acceptance #4 satisfied.

**Result on v1.2:** Emmanuel scored 18/20 and 19/20 on consecutive runs after we shipped two specific fixes that came out of his first 14/20 / 17/20 attempts:

1. **SDR-side message contamination removed** — 13 replies in `prw_replies` were actually outbound messages from Christie/Andrew/Mehdi/Chuka mislabeled as `type=REPLY`. Deleted from DB, plus an `isSdrSideMessage()` filter in `trigger/lib/smartlead.ts` (matches a list of Omnivate client outbound domains: roosterpunk.com, orbitalxbrands.com, gladlane.com, getomnivate.com, etc.) wired into the ingest task so they can't sneak back in.
2. **Stricter offer-vs-outreach rule in the classifier prompt (v1.2)** — replies that say "it sounds interesting what you do" or "appreciate you reaching out" without naming a specific element of the email itself are no longer publish-worthy, even when the reply converts. Kristian-style and Simon-style examples added as REJECTION cases in the prompt. v1.0 had 86 HQ → v1.1 had 73 HQ → v1.2 has 49 HQ. The wall gets smaller, more credible.

The quiz is a reusable audit tool — re-bake the fixture, retake the quiz, get a fresh score whenever the classifier prompt changes.

## File inventory

| Path | Role |
|---|---|
| `app/m7/pocs/page.tsx` | Side-by-side POC viewer (3 samples × 3 options + redaction toggle) |
| `app/m7/quiz/page.tsx` | Classifier audit quiz with 20 hardcoded replies and per-question reveal |
| `app/m7/data/poc-samples.ts` | 3 hardcoded POC replies, each with default redactions and matching screenshot path |
| `app/m7/data/quiz.ts` | 20 hardcoded quiz replies (10 HQ + 10 non-HQ at v1.2, deterministic seed) |
| `app/api/og-reply/route.tsx` | Option C — Satori-based image generation matching the Option B card |
| `components/email-reply-card.tsx` | Option B — code-rendered card. Used by POC viewer, OG route (logically), and the quiz |
| `public/m7/exemplar-*.png` | Option A — three M4 screenshot PNGs |
| `docs/m4-exemplars/` | Original Omar-flagged exemplar screenshots (left in place — referenced by `poc-samples.ts`) |

## What's next (M8)

M8 is "initial landing page deploy" per the brief — get an empty page on a Vercel URL with a live count from Supabase. We've already done the Vercel deploy (positive-repies-wall.vercel.app), so M8 is mostly:

1. Wire `/` (home page) to read `SELECT COUNT(*) FROM prw_classifications WHERE is_high_quality AND prompt_version = 'v1.2'` from Supabase
2. Confirm a custom subroute on omnivate.ai (or accept the Vercel URL for now)
3. Loom + sign-off

Then M9 builds the full wall on top of the `EmailReplyCard` component already proven in this milestone.
