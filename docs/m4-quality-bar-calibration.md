# M4 — Quality bar calibration

Read every flagged exemplar Omar shared (`docs/m4-exemplars/*.png`, 34 image files, 31 unique replies after de-duping). **All 31 are Omar's gold-standard "yes, publish-worthy" set** — they define the lower bound of what makes the wall, not just the top end. The job of this doc is to characterize the *full breadth* of that bar so the M6 classifier can recognize the same range.

Source: I exported the flagged exemplars from the Notion CRM as PNG screenshots into this repo. We deliberately skipped wiring the Notion MCP since the M4 read is the only Notion touchpoint in the project — exporting was faster and gives us a permanent record we can re-read when iterating the M6 classifier.

## TL;DR

A **high-quality positive reply** is one where a real B2B prospect says *something positive about the outreach itself* (not just the offer), in a way that survives PII redaction. The bar is **broader than a superlatives-only highlight reel** — Omar's set spans superlatives, personalization callouts, skeptic concessions, conversion-with-compliments, *and* short plain "good email, got my attention" acknowledgments. The variety is what makes the wall feel real. Five categories, threshold **≥55/100** on the rubric below.

## Definition

A reply qualifies as *publish-worthy* if **all three** of the following hold:

1. **There is a positive comment about the outreach itself** — its angle, copy, personalization, research, AI quality, or even just "good email." Praise of the offer or the company alone does not qualify (the wall is proof of *outreach quality*, not *product fit*).
2. **The sender is plausibly real** — natural prose, real name, business email domain. The wall is unfakeable only if every entry could plausibly be re-verified.
3. **The praise still lands after default redaction** — once prospect PII (their name, company, email) is covered with black bars, the comment about the email is still legible and credible. The SDR's first name (Christie, Andrew, James, Josh — Omnivate's people) is NOT redacted by default; keeping it preserves the natural feel of the reply. The admin decides per-reply what else to redact (see redaction policy below).

A reply can be a *positive reply* (Smartlead's `lead_category_id=1`, "Interested") without being *publish-worthy*. The classifier in M6 separates these.

## Redaction policy

What's masked on the public wall, and who decides.

**Default redactions** (applied automatically by M9, overridable by admin):
- Prospect's first and last name
- Prospect's company name
- Prospect's email address

**Default kept** (not redacted unless admin marks them):
- SDR first names (Christie, Andrew, James, Josh)
- General language about the outreach
- Common nouns (industries, roles, products mentioned in passing)

**Admin discretion** (M10 tooling):
- The admin tool lets Omar mark or unmark any span per reply before publishing.
- Used when the default mask is too aggressive, OR when a non-PII proper noun is too identifying (an event title, a blog post name, a third-party tool that would fingerprint the prospect to anyone in the industry), OR when Omar wants to leave something intact for color (a senior title without the company, for example).
- Original full text always stays in Supabase. Redactions are render-time only.

So "praise survives redaction" in practice means *praise survives the default mask of prospect PII, plus whatever extra redactions the admin chose for that reply.* Most exemplars in Omar's set survive cleanly because the praise is about the email/outreach, not about a specific prospect-identifying fact.

## Five categories

Categories describe the *type* of high-quality reply, not a strictness gate. Many exemplars overlap two or three. The table below picks the dominant signals.

### 1. The Superlative Compliment
Recipient explicitly says this is "the best / most X" cold email — often paired with the "I never respond to these" framing that strengthens the praise.

> "Thank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out." — *Mauritz Gilfillan, Jellyfish*

### 2. The Personalization Compliment
Recipient names a specific element of the email that demonstrated research (their LinkedIn post, blog, presentation, content) and praises the level of attention.

> "This has to be the most researched (or at least the most successfully researched) B2B cold email I've received. You got the content of my presentation in there ... and the link to Caroline which most people in the room are not aware of. I'm impressed!" — *Gregory Saget-Rudd, Nesto*

### 3. The Skeptic's Concession
Recipient is on record disliking cold or AI-driven outbound, then admits this one was different. High credibility because the bias against the email was the prior.

> "My opinion on AI outbound is pretty low to be honest. ... I'm not sure yours is perfect either, but it's the best I've seen so far. You've peaked my interest for sure." — *Nathaniel Cassidy, 3manfactory*

### 4. The Conversion-with-Compliment
Recipient praises *and* opens the conversation (book a call, request the report, warm-intro a colleague). Often overlaps 1–3; a multiplier on whichever compliment carries it.

> "Maybe the best effort at a cold email I have ever read. I get hundreds each week and never respond. Ever. CC'ing Betty Mok who runs marketing." — *Doug Johnson, Consensus*

### 5. The Brief Acknowledgment
Short, plain, positive note that the email landed. Less powerful in isolation but a meaningful part of the wall's texture — a wall of only superlatives reads cherry-picked; a wall with a mix of strengths reads authentic.

> "Hey James. Good email, got my attention." — *Sançar, Meet Oli*

> "That's about as good an outreach email as there is." — *Phil Draper, SalesManago*

These are real B2B senders saying real things. Leaving them out would make the wall less credible, not more.

## Inclusion / exclusion rules

**Include if:**
- The reply contains *some* positive comment about the email/outreach itself (angle, copy, personalization, research, AI quality, or just "good email")
- The sender appears to be a real human at a real B2B company (real name, business domain, natural prose)
- The praise — however brief — survives the default redaction (the comment about the email is still meaningful with prospect PII masked; SDR first names like Christie/Andrew/James/Josh stay unredacted, so addressed-by-name replies like "Christie - YOU did it!" read as written)

**Exclude if:**
- The praise is only about the offer or company ("interesting tool!", "great product"), with no comment on the outreach quality
- Reply is a polite-no with no compliment ("thanks for reaching out, not interested")
- Reply is purely conversional with no judgment of the email ("yes, send the report" with zero comment on the outreach)
- Reply is an out-of-office or auto-responder
- Sender is unidentifiable (no name, generic free-mail account with no signature)
- Negative framing dominates and the praise is a single afterthought clause that wouldn't read as positive in isolation
- The praise is wholly tied to prospect PII whose default redaction destroys the meaning (a reply that only reads as praise once you know the prospect's company name, for instance)

## All 34 exemplar files classified

Cat = primary category (1=Superlative, 2=Personalization, 3=Skeptic, 4=Conversion-with-Compliment, 5=Brief Acknowledgment). All entries are publish-worthy by Omar's curation.

| # | File | Sender (visible) | Cat | One-line essence |
|---|---|---|---|---|
| 1 | image.png | Michelle Tierney, b-engaged | 1+3 | "I never usually respond to these, but your message was crafted way better than most" |
| 2 | image (1).png | Subomi Odanye, Divrse Media | 4 | Acknowledges AI worked; converts to free trial |
| 3 | image (2).png | Charles Southgate, BizEquals | 3 | Skeptic preamble + concession ("to be fair, it is pretty good") — see borderline #2 |
| 4 | image (3).png | karthik, Mouseback | 2 | "We are impressed by the level of personalisation" |
| 5 | image (4).png | Mauritz Gilfillan, Jellyfish | 1 | "One of the best cold/outbound emails I've received in years" |
| 6 | image (5).png | Nathaniel Cassidy, 3manfactory | 1+3 | AI skeptic concedes "best I've seen so far" |
| 7 | image (6).png | Katie Horvath, Cherry BC | 1 | "One of the best sales emails I've received" + praises human feel |
| 8 | image (7).png | Joe Goss | 2+5 | Praises personalization AND asks how it was made |
| 9 | image (8).png | (header cropped) | 2 | "Hyper personalised content really makes a difference" |
| 10 | image (9).png | Joe Goss (header crop) | (dup of #8) | Duplicate of image (7).png |
| 11 | image (10).png | Joe Goss (header crop) | (dup of #8) | Duplicate of image (7).png |
| 12 | image (11).png | Wahid Omer, Voise Tech | 2 | "Stands you apart from the usual cold mails" |
| 13 | image (12).png | Annemarie Henton, Resilient Solutions 21 | 2 | "Doesn't sound ChatGPT-generic"; not interested but wanted to acknowledge |
| 14 | image (13).png | (body crop, addressed to Christie) | 2+4 | "I NEVER respond" + LinkedIn-post personalization + "let's discuss" |
| 15 | image (14).png | Doug Johnson, Consensus (CC'ing Betty Mok) | 1+4 | "Maybe the best effort at a cold email I have ever read" + warm intro |
| 16 | image (15).png | Annie Christian, VP Marketing, CourierHealth | 4 | Senior title + "kudos" + opens to report+walkthrough |
| 17 | image (16).png | Lizzy Wolff, Canidium | 1 | "Best one I've read in months" out of dozens daily |
| 18 | image (17).png | Sarah Williams, Simon-Kucher | 1+4 | "Most intuitive cold call to date" + converts |
| 19 | image (18).png | Gareth Rushgrove, Snyk | 2+4 | "Kudos on a very targeted outreach" + warm intro to Director of Comms |
| 20 | image (19).png | Sançar, Meet Oli | 5 | "Good email, got my attention" — see borderline #1 |
| 21 | image (20).png | Phil Draper, SalesManago | 1+5 | "About as good an outreach email as there is" |
| 22 | image (21).png | Martyn Swift, Head of Sales, Agena | 4+5 | "Lovely message" + senior title + opens to video |
| 23 | image (22).png | Tom Dibble-Burge, CCO/Co-founder, Dot Collective | 2 | "Kudos on the outreach – grabbed my attention" + senior title |
| 24 | image (23).png | Alex Kemp, ShipHawk | 1 | "What a killer email!!!" |
| 25 | image (24).png | Valeria Balaro, Star Global | 1+2+4 | "Most relevant and well personalised outreach email I've ever received" + converts |
| 26 | image (25).png | Ali Reed, Brainlabs Digital | 3+4 | "Usually delete these straight away but you did a good job on me ;)" + chat |
| 27 | image (26).png | Doreen DiSalvo, Head of Brand, Hilti | 2+4 | "You pulled me in. You win." + praises post-reading + follow-up + senior title |
| 28 | image (27).png | Andrew Hendry, Ignite Connections | 1+4 | "Finally an email that isn't a pitch-fest template" + "Send it over" |
| 29 | image (28).png | Gregory Saget-Rudd, Nesto | 1+2+4 | "Most researched B2B cold email" + names specifics + will forward internally |
| 30 | image (29).png | Gregory Saget-Rudd | (dup of #29) | Duplicate of image (28).png |
| 31 | image (30).png | Lexa Palfrey, Group Head of Marketing, Tradition | 3+4 | "Never reply to cold emails normally" + senior title + converts |
| 32 | image (31).png | Sara Aiello, KnowBe4 | 2+4 | "Whatever you are using for personalization is great" + scoping ask |
| 33 | image (32).png | Melani Griffith, Google | 2+4 | "Stood out because of the connection you made to our blog" + google.com sender |
| 34 | image (33).png | Marissa Tree-Hannum, Celonis | 3+4 | "Even if it seems like it had a little help from AI ;)" + converts |

**Counts:** 31 unique replies + 3 duplicate file artifacts. Distribution across categories (replies count once per category they fit):
- Superlative: 12
- Personalization: 13
- Skeptic: 7
- Conversion-with-Compliment: 16
- Brief Acknowledgment: 4

The variety is the point — a real wall of prospect replies looks like this, not like 31 identical superlatives.

## Five borderline cases

Three are constructed OUT examples (since all of Omar's flagged are IN, the OUT side needs scenarios to sharpen the rule); two are the trickiest IN cases from his set.

### Borderline 1: Sançar — "Good email, got my attention." (Omar's set) → **IN**

The shortest, plainest reply in the set. It's tempting to reject as "too thin to be social proof." But Omar flagged it, and the reasoning holds: it's an *authentic* short positive from a real B2B sender. The wall benefits from texture — a mix of brief acknowledgments alongside long superlatives reads more credible than 31 paragraphs of superlatives. The rule that comes out of this: **brief plain positives are accepted as long as they're authentic, clearly about the email, and the sender is plausibly real.**

### Borderline 2: Charles Southgate — long anti-AI preamble, then concession (Omar's set) → **IN, but display in full**

This one is a trap for rendering, not for the classifier. The reply says: "Sales outreach promoting AI is the largest type of unsolicited email I receive. However ... it is pretty good." If we extracted just the concession, the praise would read as faint. Displayed in full, the negative preamble becomes a *feature* — the concession is dramatic because of what came before. **The wall always shows replies in full; there is no truncation** (see M9 implications below). Skeptic concessions are the strongest argument for the no-truncation policy: their whole arc is the credibility.

### Borderline 3 (constructed): Pure conversion with no praise → **OUT**

> "Yes, send the report. Free Tuesday at 3."

Smartlead would tag this `lead_category_id=1` (Interested). It is a positive reply by the platform's definition. But there's no comment on the outreach itself — no praise, no acknowledgment of what landed, just business. **Conversion alone, with zero comment on the email, doesn't qualify.** This is the rule that keeps the classifier from regressing into "any Interested-tagged reply makes the wall." It's also the most common false positive we'll see in production — all 38,799 OrbitalX emails sent generated 310 replies, and the majority of those 310 will look like this.

### Borderline 4 (constructed): Praise on the offer, not the email → **OUT**

> "Interesting tool. What's the pricing model? And do you support webhooks?"

The recipient is engaging — but with the *product*, not the *outreach*. The wall is proof that Omnivate's outreach itself is excellent. A reply praising the offering belongs on a *product testimonials* page, not the outreach wall. **The classifier must judge based on the object of the praise.**

### Borderline 5: Praise containing a non-PII proper noun that could fingerprint the prospect → **IN, admin decides extra redaction**

Several real exemplars praise something specific — Gregory Saget-Rudd's "you got the content of my presentation in there ... and the link to Caroline", or Annemarie Henton's "doesn't sound ChatGPT-generic." These contain proper nouns (a colleague's first name, a specific event, a tool name) that aren't strictly PII but, combined with what's left after the default mask, could identify the prospect to anyone in the industry. The classifier should *not* gate on this — it's IN. **The admin decides at publish time** whether to add extra redactions per reply via the M10 tooling. Rule: classifier scores the reply on its quality alone; admin handles the per-reply privacy judgment. Original full text is preserved in Supabase — only the rendered output is masked.

## Scoring rubric (0–100)

Total = sum of four components. **Threshold for publish-worthy: ≥55**. The threshold is calibrated so every Omar-flagged exemplar scores ≥55 and the constructed OUT cases score below.

| Component | Weight | 0–5 | 5–15 | 15–20 | 20–25/30 |
|---|---|---|---|---|---|
| **Praise of the email itself** | /30 | No praise — only offer/product comments, or polite no | Mild positive ("good email", "lovely message", "got my attention") | Strong direct praise ("really stood out", "stands apart", "kudos on the outreach") OR personalization callout OR skeptic concession | Superlative about cold/outbound emails generally ("best", "most", "killer", "as good as it gets") |
| **Specificity & color** | /25 | Vague to the point of suspicion (could be ChatGPT-fabricated) | Brief, generic but well-formed positive | Names personalization broadly ("personalised approach") OR includes context that strengthens praise ("hundreds a week", "in years") | Names a concrete element (the LinkedIn post, the blog, the talk title, "the storytelling") OR explicit skeptic-reversal framing |
| **Sender authenticity** | /25 | Anonymous, generic, or suspicious (free-mail, no signature) | Real human, minimal context | Real name + business domain + natural prose | Senior title visible (CMO, VP, Head of, Founder, CCO) AND/OR named recognizable company (Google, Celonis, Snyk, Hilti, Jellyfish) |
| **Stands after default redaction** | /20 | Cannot read once prospect name/company/email is masked — praise object becomes ambiguous | Heavily prospect-PII-dependent — only fully clear when the prospect is identified | Mostly clear; default mask loses minor context but message remains | Stands on its own — masking prospect PII (while keeping SDR first name) preserves the message intact |

### Calibration self-test (3 exemplars from Omar's set, spanning the range)

| Exemplar | Praise | Specificity | Authenticity | Standalone | **Total** | Verdict |
|---|---|---|---|---|---|---|
| Sançar — "Good email, got my attention" | 12 | 8 | 20 | 20 | **60** | Publish (low end of IN) |
| Annie Christian (VP Mktg) — "kudos for your outreach + open to report" | 18 | 12 | 25 | 20 | **75** | Publish (mid) |
| Mauritz Gilfillan — "best cold/outbound emails in years" | 30 | 22 | 25 | 20 | **97** | Publish (top) |

Spread of 60 → 75 → 97 across three real Omar-flagged exemplars — all clear the 55 threshold, the rubric still discriminates intensity. Two scorers should land within ±10 because each band is anchored to concrete language patterns ("superlative", "names the element", "Head of/VP", "redacts cleanly").

OUT-side sanity check (constructed):
- "Yes, send the report" (pure conversion): 0 + 0 + 20 + 20 = **40**. Below threshold ✓
- "Interesting tool, what's pricing?" (praise on offer): 0 + 0 + 20 + 20 = **40**. Below threshold ✓
- Out-of-office reply: 0 + 0 + 0 + 0 = **0**. ✓

## What this means for M6

The classifier prompt should:

- **Take this rubric verbatim as the scoring schema** — return four sub-scores + total, not just a yes/no flag. Storing components lets us tune the threshold post-launch without re-classifying.
- **Use Categories 1–5 as the `category` field**. Multiple categories per reply is normal (Mauritz=1, Doreen=2+4, Gregory=1+2+4); store as an array or primary+secondary.
- **Be liberal in including, tight in excluding.** Omar's set tells us the bar is broader than instinct says — short plain positives ("got my attention") are in. The classifier's job is rejecting *non-praise* (pure conversion, offer-only, polite-no), not gatekeeping for superlatives only.
- **Train on a balanced subset of the set:** ~12 exemplars covering all five categories (at least 2 from category 5 to stop the model from rejecting brief acknowledgments) + 3 obvious-no replies (the borderline #3 / #4 shapes above) + 2 of the trickier IN cases (Charles Southgate's full preamble, Sançar's brief acknowledgment).
- **Reject "compliment on offer only"** explicitly in the prompt. This is the most common false positive: prospects say "interesting product" without commenting on the email. The classifier must classify on the object of the praise.

The threshold of 55 is a *starting point* anchored to Omar's curation. After M6 runs at scale, recalibrate by hand-scoring 50 random classifications: if borderline-yeses are being rejected, lower to 50; if obvious junk is leaking in, raise to 60. Post-M6 task, not an M4 deliverable.

## Implications for M9 / M10 (rendering and ordering)

Three policies from this calibration drive M9 and M10 design:

1. **No truncation. Every reply is rendered in full.** No "show more" expand pattern, no character cap. The wall handles long bodies via clean overflow within the email-card frame, not by hiding text. Reasoning: skeptic concessions (Charles Southgate) only work with their preamble intact; brief acknowledgments are already short; admin curation is the gate before publish — if a reply is too long for the wall aesthetic, Omar declines to publish rather than the system truncating. This overrides M9's brief-suggested "truncation with a 'show more' expand" — we're picking clean overflow.
2. **Sort by reply timestamp, not by quality score.** The wall is ordered by when the reply was received, most recent first. Quality is a binary gate — the classifier already removed everything below the bar. Among publish-worthy replies, recency reads more honestly than ranking; a "best of all time" sort feels curated, while a chronological sort reads like a live feed of reactions. This overrides the brief's M10 "display priority asc, score desc, timestamp desc" suggestion. Display priority remains as an admin override for pinning.
3. **Default redaction policy** as documented above: prospect PII auto-masked, SDR first names kept, admin decides edge cases per reply via M10 tooling.
