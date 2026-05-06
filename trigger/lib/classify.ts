/**
 * Pure classifier — given a reply, returns the M4-rubric scores + categories +
 * is_high_quality flag. No DB access. Importable from the Trigger.dev task,
 * the local runner, and tests.
 *
 * Idempotency model: each classification is keyed in DB on
 * `UNIQUE(thread_id, prompt_version)`. Bumping PROMPT_VERSION here triggers
 * re-classification of every thread on the next batch run.
 */

import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { chatJson, type ChatMessage } from "./openrouter.js";

/**
 * Bump this when the prompt content changes. Bumping triggers a re-classification
 * of every thread on the next batch run because of UNIQUE(thread_id, prompt_version).
 *
 * v2.0: thread+messages restructure. Output adds `suggested_highlight_text`
 * (the killer phrase shown on the public wall) and `suggested_redactions`
 * (third-party names mentioned in the body that need black-bar masking).
 * Lead's own first/last/company names are auto-redacted at ingest from the
 * matched outbound-repo lead row, so the model focuses on names IT sees in
 * the body that aren't already on that list.
 *
 * v1.2: stricter on offer-vs-outreach distinction. Replies that praise the
 * offer/work ("it sounds interesting what you do") without naming a concrete
 * element of the email itself = NOT publish-worthy, even if they convert.
 * Added Kristian + Simon style replies as REJECTION examples.
 *
 * v1.1: prompt returns `cleaned_reply_text` (quoted thread / mobile signatures
 * stripped, UTF-8 mojibake normalized). Quiz + wall render this saved cleaned
 * text so the human reads exactly what the AI scored.
 */
export const PROMPT_VERSION = "v2.0";

/** M4 categories, mirrored as a Zod enum so the model's output is validated. */
export const CATEGORY_ENUM = [
  "superlative",
  "personalization",
  "skeptic",
  "conversion_with_compliment",
  "brief_acknowledgment",
] as const;
export type Category = (typeof CATEGORY_ENUM)[number];

/** SDR first names — kept unredacted by default per M4 redaction policy. */
export const SDR_FIRST_NAMES = ["Christie", "Andrew", "James", "Josh", "Omar"];

/** Threshold from M4: total >= 55 is publish-worthy. */
export const HIGH_QUALITY_THRESHOLD = 55;

export const ClassifyResultSchema = z.object({
  /** AI-extracted prospect reply with quoted thread / forwarded blocks /
   * mobile signatures removed and UTF-8 mojibake normalized. Required from
   * v1.1 onward. Empty string is valid and means "no original reply text"
   * (the entire body was quoted thread / forwarded). The display layer falls
   * back to the raw body in that case. */
  cleaned_reply_text: z.string().max(20000),
  praise_score: z.number().int().min(0).max(30),
  specificity_score: z.number().int().min(0).max(25),
  authenticity_score: z.number().int().min(0).max(25),
  standalone_score: z.number().int().min(0).max(20),
  is_high_quality: z.boolean(),
  categories: z.array(z.enum(CATEGORY_ENUM)),
  reasoning: z.string().min(1).max(2000),
  /** v2.0+: the public-wall highlight — a verbatim phrase from cleaned_reply_text
   * that captures the killer praise (e.g. "this is a killer email", "best cold
   * email I've received in years"). Empty string when the reply doesn't merit
   * a highlight (e.g. is_high_quality=false). */
  suggested_highlight_text: z.string().max(500).default(""),
  /** v2.0+: third-party human/company names mentioned IN the reply body that
   * should be black-barred on the public wall — e.g. a colleague the lead
   * forwarded the email to, or a company being referenced. Lead's own
   * first/last/company name is NOT included (auto-redacted at ingest). */
  suggested_redactions: z.array(z.string().max(120)).default([]),
});
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

export interface ClassifyInput {
  reply_subject: string | null;
  reply_body: string;
  reply_from_email: string;
  lead_first_name?: string | null;
  lead_last_name?: string | null;
  lead_company_name?: string | null;
}

// Load the prompt at module init. We do this lazily-on-first-call so tests
// that mock OpenRouter don't pay the file-read cost.
let _systemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  const here = dirname(fileURLToPath(import.meta.url));
  const promptPath = resolve(here, "..", "prompts", "classify-reply.md");
  _systemPrompt = readFileSync(promptPath, "utf8");
  return _systemPrompt;
}

/**
 * Reverse common UTF-8-misread-as-Windows-1252 mojibake patterns. Smartlead
 * occasionally serves reply bodies whose bytes have been double-encoded at
 * some point in the mail-routing chain — `—` em dash becomes `â€"`,
 * non-breaking space becomes `Â`, smart quotes become `â€™` / `â€œ`, etc.
 *
 * Patterns ordered longest-first so multi-char sequences win before any
 * shorter overlapping pattern (e.g. `â€™` resolves before `â€`).
 */
export function normalizeEncoding(text: string): string {
  return (
    text
      // smart quotes
      .replace(/â€™/g, "'")
      .replace(/â€˜/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      // dashes + ellipsis
      .replace(/â€/g, "—") // em dash
      .replace(/â€/g, "–") // en dash
      .replace(/â€¦/g, "…")
      // catch-all for any remaining "â€<x>" pattern → assume em dash
      .replace(/â€./g, "—")
      // double-encoded NBSP — most often spurious next to spaces/periods
      .replace(/Â /g, " ")
      .replace(/(?<=\w)Â/g, "") // stray Â glued to end of a word
      .replace(/(?<=[!?.,;:)\]'"])Â/g, "") // Â immediately after punctuation
      .replace(/^Â+/gm, "") // stray Â at line start
      .replace(/Â+$/gm, "") // stray Â at line end
      // accented Latin (UTF-8 bytes for é/è/etc. read as 1252)
      .replace(/Ã©/g, "é")
      .replace(/Ã¨/g, "è")
      .replace(/Ã /g, "à") // Ã + NBSP (real mojibake form: UTF-8 byte A0 = NBSP in CP1252)
      .replace(/Ã¢/g, "â")
      .replace(/Ã¡/g, "á")
      .replace(/Ã­/g, "í")
      .replace(/Ã³/g, "ó")
      .replace(/Ãº/g, "ú")
      .replace(/Ã±/g, "ñ")
      .replace(/Ã®/g, "î")
      .replace(/Ã´/g, "ô")
      .replace(/Ã»/g, "û")
      .replace(/Ã«/g, "ë")
      .replace(/Ã¯/g, "ï")
      .replace(/Ã¶/g, "ö")
      .replace(/Ã¼/g, "ü")
  );
}

/**
 * Strip basic HTML so the model sees readable text. Smartlead reply bodies
 * are HTML; the model can sort of read HTML but cleaning helps both quality
 * and token count. Also runs `normalizeEncoding()` to undo common mojibake
 * before any downstream consumer sees the text.
 */
export function stripHtml(html: string): string {
  return normalizeEncoding(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

/** Cap input body before sending to the model. A handful of "replies" are
 * actually huge non-delivery reports / out-of-office walls / forwarded threads
 * that blow past the model's context budget. We only need the first few KB to
 * decide praise + extract any prospect-typed text. */
const MAX_BODY_CHARS = 6000;

function buildUserMessage(input: ClassifyInput): string {
  let cleanBody = stripHtml(input.reply_body);
  if (cleanBody.length > MAX_BODY_CHARS) {
    cleanBody = cleanBody.slice(0, MAX_BODY_CHARS) + "\n[...body truncated for length...]";
  }
  return [
    `INPUT:`,
    `  reply_subject: ${input.reply_subject ? JSON.stringify(input.reply_subject) : "null"}`,
    `  reply_body: ${JSON.stringify(cleanBody)}`,
    `  reply_from_email: ${JSON.stringify(input.reply_from_email)}`,
    `  lead_first_name: ${JSON.stringify(input.lead_first_name ?? null)}`,
    `  lead_last_name: ${JSON.stringify(input.lead_last_name ?? null)}`,
    `  lead_company_name: ${JSON.stringify(input.lead_company_name ?? null)}`,
    `  sdr_first_names: ${JSON.stringify(SDR_FIRST_NAMES)}`,
    ``,
    `Return your classification as JSON only — no markdown fences, no prose.`,
  ].join("\n");
}

/**
 * Defensive post-processing on the model's output:
 *   1. Recompute `is_high_quality` from sub-scores — never trust the model's flag.
 *      Catches the "praise_score=10 but flag=true" inconsistency the prompt's
 *      BAD EXAMPLES warns the model about.
 *   2. Run `normalizeEncoding()` over `cleaned_reply_text` — defense-in-depth in
 *      case the model missed any mojibake clusters in its cleaning.
 */
function postProcess(parsed: ClassifyResult): ClassifyResult {
  const total =
    parsed.praise_score +
    parsed.specificity_score +
    parsed.authenticity_score +
    parsed.standalone_score;
  const isHigh = total >= HIGH_QUALITY_THRESHOLD;
  // Suppress highlight when the reply isn't publish-worthy. Otherwise the
  // wall could pick up a "killer phrase" from a thread we're never going to
  // show.
  const highlight = isHigh ? normalizeEncoding(parsed.suggested_highlight_text).trim() : "";
  // Dedupe + trim suggested redactions; drop empty strings.
  const seen = new Set<string>();
  const redactions: string[] = [];
  for (const r of parsed.suggested_redactions) {
    const t = normalizeEncoding(r).trim();
    if (t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    redactions.push(t);
  }
  return {
    ...parsed,
    cleaned_reply_text: normalizeEncoding(parsed.cleaned_reply_text).trim(),
    is_high_quality: isHigh,
    suggested_highlight_text: highlight,
    suggested_redactions: redactions,
  };
}

/**
 * Classify a single reply. Network call to OpenRouter.
 * Throws if the model returns an unparseable / out-of-schema response after
 * retries — caller decides whether to skip-and-continue or abort.
 */
export async function classifyReply(input: ClassifyInput): Promise<ClassifyResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: getSystemPrompt() },
    { role: "user", content: buildUserMessage(input) },
  ];
  // 2500 max_tokens accommodates cleaned_reply_text for long replies + the
  // four sub-scores + reasoning + categories. Body itself is pre-capped at
  // MAX_BODY_CHARS so cleaned_reply_text can never exceed it.
  const raw = await chatJson<unknown>(messages, { temperature: 0.1, maxTokens: 2500 });
  const parsed = ClassifyResultSchema.parse(raw);
  return postProcess(parsed);
}
