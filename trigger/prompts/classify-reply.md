# Classify reply — v2.0

> The prompt the M6 classifier sends to OpenRouter (`xiaomi/mimo-v2-flash`).
> Externalised here so Omar can iterate on the prompt without touching code.
> Bump `PROMPT_VERSION` (in `trigger/lib/classify.ts`) when editing — that
> triggers re-classification on the next run.
>
> **v2.0 changes:** thread+messages restructure. Two new outputs alongside the
> existing scores + cleaned text:
> - `suggested_highlight_text` — the verbatim killer phrase shown on the
>   public wall ("this is a killer email", "best cold email I've received").
>   The wall renders this with visual emphasis; the rest of the reply renders
>   as a truncated excerpt around it.
> - `suggested_redactions` — third-party human/company names mentioned IN the
>   reply body that should be black-barred. The lead's own first/last/company
>   name is auto-redacted at ingest from the matched outbound-repo lead row,
>   so DO NOT include those here.
>
> **v1.2 changes:** stricter on the offer-vs-outreach distinction. "It sounds
> interesting", "your work looks great", "thanks for reaching out" *without*
> a concrete reference to copy / personalization / angle = NOT publish-worthy
> even if the reply converts to a meeting.
>
> **v1.1 changes:** the model returns `cleaned_reply_text` — the prospect's
> actual new reply with quoted thread / forwarded block / mobile signatures
> stripped, and UTF-8 mojibake (â€™, Â, etc.) normalized.

---

You do THREE jobs in one pass on a reply that landed in our cold-outbound inbox:

1. **Extract** the prospect's actual new reply text (cleaning trail content and encoding artifacts).
2. **Score** it against a 4-component rubric (0–100 total) to decide whether it's worth publishing on a public "wall of positive replies" page.
3. **Highlight + redact** — pick the killer phrase to feature on the wall, and flag any third-party names in the body that should be masked.

# THE OBJECTIVE

A real B2B prospect wrote back to one of our cold emails and said *something* about the outreach itself. Some of them gushed ("best cold email I've ever read"). Some of them wrote a single sentence ("good email, got my attention"). Some of them grumbled about hating cold emails first and then conceded ours was different. Some pointed at a specific element — their LinkedIn post, their blog, a presentation they gave — that the outreach referenced. Some replied positively *and* asked to book a call.

All of those are publish-worthy. The wall is more credible when it shows *variety* — superlatives mixed with brief acknowledgments mixed with skeptic concessions — because that's what real prospect reactions look like. A wall of nothing but superlatives reads cherry-picked.

What is **not** publish-worthy:
- Replies that praise the offer/product but say nothing about the outreach quality ("Interesting tool, what's pricing?")
- Replies that convert but don't comment on the email ("Yes, send the report. Free Tuesday")
- Polite "not interested" replies with no praise
- Out-of-office or auto-responder text
- Vague positives that are too thin to be credible third-party social proof

## The offer / outreach distinction (sharp)

This is the single hardest call. Be conservative. *Praise on the offer* — what we sell, what we do, the value, the work, the report — does NOT qualify, even when the reply converts to a meeting and feels positive. *Praise on the outreach* — the email itself, its copy, the angle, the personalization, how researched it was, the writing — qualifies.

Examples of OFFER praise (do NOT qualify):
- "Sounds interesting" / "It sounds interesting what you do" → praising what we DO
- "I'm interested in hearing more about your work / your tool / your approach" → product
- "Thanks for the materials, looks helpful" → the materials, not the email
- "I'd love to learn more" → curiosity about offer
- "Appreciate you reaching out, can we schedule a call?" → polite + conversion, no comment on email itself
- "Thank you for your mails, it sound interesting what you do" → the WORK is interesting; the email is just acknowledged

Examples of OUTREACH praise (DO qualify):
- "This is a great email" / "Best cold email I've received" → the email
- "Loved how you tied this to my LinkedIn post" → the personalization
- "Kudos on the targeted outreach" → the targeting
- "I never reply to these but yours stood out" → the email vs. other emails
- "Great email opener, got my attention" → the opener / copy

If a reply has both — passing offer praise AND a genuine outreach compliment — the outreach compliment carries it. If a reply has only the conversion + offer praise without ANY mention of the email's quality, it's NOT publish-worthy regardless of how warm the tone is.

## What we mean by "the prospect's actual reply"

The `reply_body` you receive may include extra content the prospect's mail client appended automatically: the original outbound email quoted below ("On Mon, ..., James Ford <james.ford@orbitalxbrands.com> wrote:"), a forwarded message block ("---------- Forwarded message ----------"), an Outlook 3-line header ("From: ... Sent: ... To: ..."), or a mobile auto-signature ("Sent from my iPhone", "Get Outlook for iOS"). NONE of that is what the prospect typed *now* — it's the mail client decorating the message. Strip everything from the first such marker onward.

Keep the prospect's own signature (the line or two they typed before sending, e.g. "Best, Sara" or "—Doreen"). That's part of their new reply.

## What we mean by "encoding artifacts"

Replies sometimes pass through mail-routing chains that mis-decode UTF-8 as Windows-1252 and re-encode it back. The result is mojibake — single characters that show up as 2–3 garbage characters. Normalize them in `cleaned_reply_text`:

| Garbled | Should be | What it actually is |
|---|---|---|
| `â€™` | `'` | smart apostrophe |
| `â€œ` / `â€` | `"` / `"` | smart quotes |
| `â€"` (with U+201D) | `—` | em dash |
| `â€"` (with U+201C) | `–` | en dash |
| `â€¦` | `…` | ellipsis |
| `Â ` | ` ` (space) | non-breaking space |
| `Â` (stray, near a period or word) | drop entirely | residue |
| `Ã©`, `Ã¨`, `Ã ` | `é`, `è`, `à` | accented Latin |

You read the reply, produce the cleaned text, score it, then surface the highlight phrase and any third-party-name redactions. Scores apply to the *cleaned* text. The threshold is 55: anything ≥55 is publish-worthy.

## The highlight phrase

`suggested_highlight_text` is a **verbatim phrase from `cleaned_reply_text`** — the line that earns this reply its place on the wall. It's what visitors see emphasized first; the truncated excerpt renders around it.

Pick rules:
- **Verbatim only.** Quote it character-for-character from `cleaned_reply_text`. Don't paraphrase, summarize, or invent.
- **Praise about the OUTREACH.** Same rule as the rubric — if the line that "feels" like the highlight is praise on the offer, the reply isn't publish-worthy and the highlight should be empty (see next bullet).
- **Empty string when not publish-worthy.** If `is_high_quality` is false, return `""` for the highlight. The wall never shows non-publish-worthy threads, so a highlight is wasted.
- **Trim hedges.** Drop greetings ("Hi Andrew,") and signoffs ("Cheers, —Doreen") from the highlight; keep just the praising sentence(s).
- **One sentence usually, two at most.** A one-line punch beats a paragraph. If the praise is two short sentences ("This is a killer email!! Best in years."), keep both. Otherwise the strongest sentence.
- **Length cap 500 chars.** Long highlights look like quotes; that's not the point.

## Third-party redactions

`suggested_redactions` is a list of **human or company names mentioned IN the reply body** that should be visually masked on the public wall. Only third-party names. The lead's own first/last/company name and the SDR's first name are handled separately — DO NOT include those here.

Pick rules:
- **Third parties only.** Examples: a colleague the lead is forwarding to ("Mark forwarded me"), a company being referenced ("Heru's marketing director"), an executive the lead reports to.
- **Skip SDR first names.** Christie / Andrew / James / Josh / Omar are our SDRs. Keep them visible.
- **Skip the lead's own identity.** Their own first name, last name, company, and email are auto-masked at ingest from the matched outbound-repo lead row. The list here is for names the model SEES in the body that aren't already on that auto list.
- **Verbatim strings.** "Mark", "Heru", "Caroline", "Future" — exactly as they appear in the body so the renderer can substring-match.
- **Empty list when there's nothing to mask.** Most one-line replies have no third-party names. `[]` is the common case.

# INPUT

You'll get:
- `reply_subject`: text or null (often "Re: ...")
- `reply_body`: text — the reply body, cleaned of most HTML
- `reply_from_email`: text — the sender's email (may be a forwarded recipient)
- `lead_first_name`, `lead_last_name`, `lead_company_name`: text or null — the prospect we originally targeted (use only as light context; don't quote in your reasoning, and these names go in `suggested_redactions` ONLY if they appear in the body but are auto-redacted by ingest anyway, so just skip)
- `sdr_first_names`: array of strings — the names of *our* outbound senders (e.g., ["Christie", "Andrew", "James", "Josh"]). When you see one of these names addressed in the reply ("Hi Christie..."), recognise that's our SDR being addressed by name, not a person to redact.

# OUTPUT

Return JSON only — no markdown fences, no prose before or after the JSON.

```
{
  "cleaned_reply_text": "the prospect's actual new reply, with quoted thread / forwarded blocks / mobile signatures removed and any encoding artifacts normalized",
  "praise_score": integer 0–30,
  "specificity_score": integer 0–25,
  "authenticity_score": integer 0–25,
  "standalone_score": integer 0–20,
  "is_high_quality": true | false,
  "categories": [array of one or more from the enum below, OR empty when not publish-worthy],
  "reasoning": "one or two sentences — what stood out and why this score",
  "suggested_highlight_text": "verbatim phrase from cleaned_reply_text — empty string when not publish-worthy",
  "suggested_redactions": [array of third-party names mentioned in the body — empty when none]
}
```

`is_high_quality` is true iff `praise_score + specificity_score + authenticity_score + standalone_score >= 55`. The DB will recompute the total from your sub-scores; you don't need to return it.

# CATEGORY ENUM

Use only these strings in `categories` (lowercase, snake_case). One reply often fits multiple — return all that apply.

- `superlative` — explicit "best / most / killer" comparative claim about cold/outbound emails
- `personalization` — names a specific element the email referenced (a post, blog, talk, content piece)
- `skeptic` — recipient is on record disliking cold/AI outreach, then concedes this one was different
- `conversion_with_compliment` — recipient praises *and* opens the conversation (yes / let's chat / send the report / loop in a colleague)
- `brief_acknowledgment` — short, plain, positive note ("good email", "lovely message", "got my attention") that's authentic but not effusive

# THE RUBRIC

## praise_score (0–30) — how strongly worded is the praise about the email?
- 25–30: superlative about cold/outbound emails generally ("best", "most", "killer", "as good as it gets")
- 20–24: strong direct praise ("really stood out", "stands apart", "kudos on the outreach", "great email opener", "you pulled me in")
- 15–19: personalization callout OR skeptic concession framing ("doesn't sound ChatGPT-generic", "best I've seen so far")
- 8–14: mild positive ("good email", "lovely message", "got my attention", "nice job")
- 1–7: backhanded or buried praise — a single-clause positive in an otherwise negative message
- 0: no praise about the outreach itself (might still praise the offer — that's a different score)

## specificity_score (0–25) — does the praise point at something concrete?
- 20–25: names a concrete element (the LinkedIn post, the blog, the talk title, the storytelling angle, the research depth) — third-party reader can tell what was praised
- 15–19: skeptic-reversal framing OR superlative comparison context ("hundreds a week", "in years", "in months")
- 8–14: references personalization broadly ("personalised approach", "you did your research") without naming the element
- 3–7: brief but well-formed positive — generic but credible
- 0–2: vague to the point of suspicion — could be ChatGPT-fabricated testimonial copy

## authenticity_score (0–25) — does the sender feel real?
- 20–25: senior title visible (CMO, CEO, Founder, VP, Head of, CCO, Director) AND/OR a recognisable company (Google, Celonis, Snyk, Hilti, Jellyfish-tier)
- 15–19: real name + business email domain + natural prose
- 8–14: real human, minimal context, generic-but-real domain
- 3–7: identity is sparse but plausible
- 0–2: anonymous, generic free-mail account, suspicious / could be fake

## standalone_score (0–20) — does the praise survive default redaction (prospect name + company + email masked, SDR first names kept)?
- 17–20: stands on its own — black bars on prospect PII don't lose the message
- 12–16: mostly clear; default mask loses minor context but message remains
- 6–11: heavily prospect-PII-dependent — only fully clear when the prospect is identified
- 0–5: cannot read once prospect name/company is masked — praise becomes ambiguous

# RULES

1. **JSON only.** No markdown fences. No prose before or after. No trailing commas.
2. **Score against the email/outreach, not the offer.** "Interesting product, what's pricing?" is a 0 on praise_score even though the email worked.
3. **Brief is OK.** Don't penalise short replies if they're authentic and clearly about the email — `brief_acknowledgment` is a real category.
4. **SDR first names are not PII.** When you see "Hi Christie" or "Hi Andrew" in the reply, that's our SDR — keeping it visible doesn't hurt standalone_score and DOES NOT go in `suggested_redactions`.
5. **Highlight is verbatim or empty.** Quote it from `cleaned_reply_text` character-for-character, or return `""` when the reply isn't publish-worthy.
6. **Redactions are third-party only.** The lead's own first/last/company name is auto-redacted at ingest. SDR first names stay visible. Only flag OTHER names you see in the body.
7. **One reply, one classification.** Don't reason about "what other replies might score higher". Only the reply you're given.

# GOOD EXAMPLES

Each example shows a real reply (lightly trimmed) and the expected output. Reasoning is one or two sentences.

> Every input here is already clean (no quoted thread, no forwarded block, no encoding artifacts). For each one, your output's `cleaned_reply_text` should equal `reply_body` verbatim — copy it through unchanged. The two examples *after* the rejection set show how to strip a trail and fix mojibake.

---

INPUT:
  reply_subject: "Re: analog childhood"
  reply_body: "Hi Omar,\n\nThank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out."
  reply_from_email: "mauritz.gilfillan@jellyfish.com"
  lead_company_name: "Jellyfish"

→ {
  "cleaned_reply_text": "Hi Omar,\n\nThank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out.",
  "praise_score": 30,
  "specificity_score": 22,
  "authenticity_score": 25,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["superlative"],
  "reasoning": "Pure superlative — 'one of the best cold/outbound emails I've received in years' — from a Jellyfish-domain sender. Praise survives redaction cleanly.",
  "suggested_highlight_text": "this is one of the best cold/outbound emails I've received in years. It really stood out.",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: conductor metaphor"
  reply_body: "Hi Josh,\n\nThis has to be the most researched (or at least the most successfully researched) B2B cold email I've received. You got the content of my presentation in there (which I doubt you attended in person since you're in the uk), and the link to Caroline which most people in the room are not aware of. I'm impressed!\nBecause of that, if you want to share the video, I'll forward it to the appropriate people internally..."
  reply_from_email: "greg@nestogroup.ca"

→ {
  "cleaned_reply_text": "Hi Josh,\n\nThis has to be the most researched (or at least the most successfully researched) B2B cold email I've received. You got the content of my presentation in there (which I doubt you attended in person since you're in the uk), and the link to Caroline which most people in the room are not aware of. I'm impressed!\nBecause of that, if you want to share the video, I'll forward it to the appropriate people internally...",
  "praise_score": 30,
  "specificity_score": 25,
  "authenticity_score": 25,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["superlative", "personalization", "conversion_with_compliment"],
  "reasoning": "Names two concrete personalization elements (the presentation content, the Caroline link), uses a superlative ('most researched B2B cold email'), and converts to forwarding the video internally. All three categories firing.",
  "suggested_highlight_text": "This has to be the most researched (or at least the most successfully researched) B2B cold email I've received.",
  "suggested_redactions": ["Caroline"]
}

---

INPUT:
  reply_subject: "Re: member profiles citable"
  reply_body: "Hi Omar,\n\nThanks for your email.\n\nSales outreach, promoting utilisation of 'smart' AI to scale, is the largest type of unsolicited email I receive. However, I decided to have a look at a couple of your videos and can see how your process makes sense. I can see how AI and your system structured your email, and to be fair, it is pretty good."
  reply_from_email: "charles.southgate@bizequals.com"

→ {
  "cleaned_reply_text": "Hi Omar,\n\nThanks for your email.\n\nSales outreach, promoting utilisation of 'smart' AI to scale, is the largest type of unsolicited email I receive. However, I decided to have a look at a couple of your videos and can see how your process makes sense. I can see how AI and your system structured your email, and to be fair, it is pretty good.",
  "praise_score": 22,
  "specificity_score": 22,
  "authenticity_score": 22,
  "standalone_score": 18,
  "is_high_quality": true,
  "categories": ["skeptic"],
  "reasoning": "Long anti-AI-outreach preamble followed by a concession ('to be fair, it is pretty good'). The negative preamble makes the concession credible — the praise had to earn its way past a stated bias.",
  "suggested_highlight_text": "to be fair, it is pretty good",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: future of care"
  reply_body: "Hi Christie,\n\nI don't usually respond to these, so kudos for your outreach. I'd be open to reviewing the report of the tool's findings with a video walk-through.\n\n--\nAnnie Christian\nVP of Marketing"
  reply_from_email: "annie.christian@courierhealth.com"

→ {
  "cleaned_reply_text": "Hi Christie,\n\nI don't usually respond to these, so kudos for your outreach. I'd be open to reviewing the report of the tool's findings with a video walk-through.\n\n--\nAnnie Christian\nVP of Marketing",
  "praise_score": 22,
  "specificity_score": 12,
  "authenticity_score": 25,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["conversion_with_compliment"],
  "reasoning": "VP-Marketing title visible plus the 'I don't usually respond to these' frame, then converts to a report+walkthrough.",
  "suggested_highlight_text": "I don't usually respond to these, so kudos for your outreach.",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: bar seating apologetic"
  reply_body: "Hi Andrew,\n\nYou pulled me in. You win. I will let you give me a free report. I know it is big of me.\n\nLet's do and I appreciate you reading my post and actually sending me an email that praises me with a follow-up that matters. Well done from a content perspective.\n\nCheers and looking forward to chatting.\n\nDoreen DiSalvo\nHead of Brand and External Communications"
  reply_from_email: "Doreen.DiSalvo@hilti.com"

→ {
  "cleaned_reply_text": "Hi Andrew,\n\nYou pulled me in. You win. I will let you give me a free report. I know it is big of me.\n\nLet's do and I appreciate you reading my post and actually sending me an email that praises me with a follow-up that matters. Well done from a content perspective.\n\nCheers and looking forward to chatting.\n\nDoreen DiSalvo\nHead of Brand and External Communications",
  "praise_score": 25,
  "specificity_score": 22,
  "authenticity_score": 25,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["personalization", "conversion_with_compliment"],
  "reasoning": "Hilti Head of Brand. Names the personalization (reading her post + a follow-up that matters), playful 'you pulled me in' frame, converts to 'looking forward to chatting'.",
  "suggested_highlight_text": "You pulled me in. You win. I appreciate you reading my post and actually sending me an email that praises me with a follow-up that matters. Well done from a content perspective.",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: edge 8 gig wifi 7"
  reply_body: "Hi Christie,\n\nThanks for your email. I receive numerous solicitations daily and yours stood out because of the connection you made to our blog. I'm open to receiving a report and hearing your insights."
  reply_from_email: "melanigriffith@google.com"

→ {
  "cleaned_reply_text": "Hi Christie,\n\nThanks for your email. I receive numerous solicitations daily and yours stood out because of the connection you made to our blog. I'm open to receiving a report and hearing your insights.",
  "praise_score": 22,
  "specificity_score": 25,
  "authenticity_score": 25,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["personalization", "conversion_with_compliment"],
  "reasoning": "google.com sender, names the blog as the personalization hook, frames it as standing out among 'numerous solicitations daily', converts to a report.",
  "suggested_highlight_text": "I receive numerous solicitations daily and yours stood out because of the connection you made to our blog.",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: ingredients versus chef"
  reply_body: "Hey James.\n\nGood email, got my attention."
  reply_from_email: "sancar@meetoli.ai"

→ {
  "cleaned_reply_text": "Hey James.\n\nGood email, got my attention.",
  "praise_score": 12,
  "specificity_score": 8,
  "authenticity_score": 20,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["brief_acknowledgment"],
  "reasoning": "Short and plain but authentic — real person at meetoli.ai with a natural one-liner. Total of 60 clears the threshold.",
  "suggested_highlight_text": "Good email, got my attention.",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: hob nob in a work brew"
  reply_body: "That's about as good an outreach email as there is."
  reply_from_email: "phil.draper@salesmanago.com"

→ {
  "cleaned_reply_text": "That's about as good an outreach email as there is.",
  "praise_score": 28,
  "specificity_score": 15,
  "authenticity_score": 20,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["superlative", "brief_acknowledgment"],
  "reasoning": "One-line superlative ('about as good an outreach email as there is'). The comparative claim is strong and credible from a SalesManago email.",
  "suggested_highlight_text": "That's about as good an outreach email as there is.",
  "suggested_redactions": []
}

---

INPUT:
  reply_subject: "Re: fellers inventory gears"
  reply_body: "What a killer email!!!"
  reply_from_email: "alex.kemp@shiphawk.com"

→ {
  "cleaned_reply_text": "What a killer email!!!",
  "praise_score": 25,
  "specificity_score": 10,
  "authenticity_score": 17,
  "standalone_score": 20,
  "is_high_quality": true,
  "categories": ["superlative", "brief_acknowledgment"],
  "reasoning": "One-line three-exclamation 'killer email' superlative from a real ShipHawk sender. Survives redaction trivially.",
  "suggested_highlight_text": "What a killer email!!!",
  "suggested_redactions": []
}

# REJECTION EXAMPLES

These are positive replies (lead_category_id=1) that should still classify as **not** publish-worthy because they don't praise the outreach itself. Each totals below 55. **Note `suggested_highlight_text` is `""` for every rejection** — there's no point highlighting a reply we won't show.

---

INPUT:
  reply_subject: "Re: your offer"
  reply_body: "Hi Andrew, yes — send the report. Free Tuesday at 3."
  reply_from_email: "buyer@example.com"

→ {
  "cleaned_reply_text": "Hi Andrew, yes — send the report. Free Tuesday at 3.",
  "praise_score": 0,
  "specificity_score": 0,
  "authenticity_score": 20,
  "standalone_score": 20,
  "is_high_quality": false,
  "categories": [],
  "reasoning": "Pure conversion — agreed to next step, but no comment whatsoever about the outreach itself. The wall is proof of outreach quality, not pipeline.",
  "suggested_highlight_text": "",
  "suggested_redactions": []
}

---

INPUT (the Kristian case — converts + offer-praise but no outreach praise):
  reply_subject: "Re: your campaign"
  reply_body: "Hi Andrew,\n\nSorry for not getting back last week - I am at a conference right now, so I will make it a bit short.\n\nThank you for your mails, it sound interesting what you do, and I have myself been thinking about mostly the last two bullets you list. I do not want to waste your time and I am guessing you are not doing this just for fun/learning, so what would the cost approximately be for this to be worth it for you and what outcomes would I/my business be able to expect for the amount you propose?\n\nThank you for a short feedback – happy to jump on a call early next week, if that is better?\n\nCheers,\nKristian"
  reply_from_email: "kristian@example.com"

→ {
  "cleaned_reply_text": "Hi Andrew,\n\nSorry for not getting back last week - I am at a conference right now, so I will make it a bit short.\n\nThank you for your mails, it sound interesting what you do, and I have myself been thinking about mostly the last two bullets you list. I do not want to waste your time and I am guessing you are not doing this just for fun/learning, so what would the cost approximately be for this to be worth it for you and what outcomes would I/my business be able to expect for the amount you propose?\n\nThank you for a short feedback – happy to jump on a call early next week, if that is better?\n\nCheers,\nKristian",
  "praise_score": 5,
  "specificity_score": 5,
  "authenticity_score": 22,
  "standalone_score": 18,
  "is_high_quality": false,
  "categories": [],
  "reasoning": "'It sound interesting what you do' praises the work/offer, not the outreach. Conversion alone — even with a friendly tone — doesn't qualify.",
  "suggested_highlight_text": "",
  "suggested_redactions": []
}

# EXTRACTION EXAMPLES — `cleaned_reply_text` in action

These show the cleaning behavior. The scoring is incidental; focus on what `cleaned_reply_text` keeps and what it drops, and on how third-party-name redactions surface.

---

INPUT (Gmail-style with quoted thread, third-party name in body):
  reply_subject: "Re: vr in eye care"
  reply_body: "Hi James,\n\nReaching out on behalf of Heru as their marketing director. Mark forwarded me your outreach, and I'd like to learn more — feel free to send the video.\n\nCheers,\nJordan\n\nOn Mon, Jan 19, 2026 at 11:21 AM James Ford <james.ford@orbitalxbrands.com> wrote:\n> Hi Mark,\n> Your latest Eye.Talk... [original outbound email, 30 lines]"
  reply_from_email: "jordan@grayhouse.consulting"

→ {
  "cleaned_reply_text": "Hi James,\n\nReaching out on behalf of Heru as their marketing director. Mark forwarded me your outreach, and I'd like to learn more — feel free to send the video.\n\nCheers,\nJordan",
  "praise_score": 5,
  "specificity_score": 5,
  "authenticity_score": 22,
  "standalone_score": 18,
  "is_high_quality": false,
  "categories": [],
  "reasoning": "Forwarded by Mark to Jordan, who replied — but only engages with the offer, no comment on the outreach itself.",
  "suggested_highlight_text": "",
  "suggested_redactions": ["Heru", "Mark"]
}

---

INPUT (with mojibake artifacts and a "Sent from my iPhone" trail):
  reply_subject: "Re: pulse survey"
  reply_body: "Thanks Andrew â€\" I have completed the survey!Â\n\nScheduled us time for the 18th.Â I'll try to work on the Pulse survey today!Â\n\nSent from my iPhone"
  reply_from_email: "person@example.com"

→ {
  "cleaned_reply_text": "Thanks Andrew — I have completed the survey!\n\nScheduled us time for the 18th. I'll try to work on the Pulse survey today!",
  "praise_score": 0,
  "specificity_score": 0,
  "authenticity_score": 18,
  "standalone_score": 18,
  "is_high_quality": false,
  "categories": [],
  "reasoning": "Pure conversion — no comment on the outreach.",
  "suggested_highlight_text": "",
  "suggested_redactions": []
}

# BAD EXAMPLES — DO NOT DO THIS

bad: Wrapping the JSON in a markdown code fence (```json ... ```). The downstream parser fails on the fence.

bad: Inventing a category not in the enum (e.g., "thoughtful_reply", "warm_response"). Use only the five enum strings.

bad: Returning `total_score` in the JSON. The DB computes the total from your sub-scores; an extra field will be ignored at best, throw at worst.

bad: Setting `is_high_quality: true` while the four sub-scores sum to less than 55. The flag must be derived from the total.

bad: Quoting the prospect's name or company in `reasoning` ("Mark from Heru loved the email"). Reasoning is for the operator's audit log; keep it about *what* in the email landed, not *who* sent it.

bad: Scoring `authenticity_score: 25` for a generic free-mail address (gmail.com, yahoo.com, hotmail.com). Real B2B usually means a corporate domain.

bad: Penalising a short reply for being short. "Good email, got my attention" from a real B2B sender is publish-worthy on this rubric — the brief_acknowledgment category exists for exactly this shape.

bad: Inventing text in `cleaned_reply_text` that wasn't in the input. The cleaning step REMOVES (trail, mojibake garbage) — it never adds, paraphrases, or summarizes.

bad: Including the quoted thread in `cleaned_reply_text` ("Hi James, thanks!\n\nOn Mon Jan 19 ... wrote:\n> Hi Mark, your latest..."). Strip everything from the first quoted-thread / forwarded-block / mobile-signature marker onward.

bad: Omitting `cleaned_reply_text` entirely from the output, or returning it as empty when the input has actual text.

bad: Putting the lead's own first/last/company name in `suggested_redactions`. Those are auto-redacted at ingest. The list is for OTHER names you see in the body.

bad: Putting an SDR first name (Christie / Andrew / James / Josh / Omar) in `suggested_redactions`. SDRs are not PII; their names stay visible on the wall.

bad: Paraphrasing the highlight ("the prospect said it was a great email"). The highlight must be a verbatim phrase from `cleaned_reply_text`.

bad: Returning a non-empty `suggested_highlight_text` when `is_high_quality` is false. The wall doesn't render non-publish-worthy threads — the highlight should be `""`.
