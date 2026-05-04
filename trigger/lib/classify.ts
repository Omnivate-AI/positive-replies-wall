/**
 * Pure classifier — given a reply, returns the M4-rubric scores + categories +
 * is_high_quality flag. No DB access. Importable from the Trigger.dev task,
 * the local runner, and tests.
 *
 * Idempotency model: each classification is keyed in DB on
 * `UNIQUE(reply_id, prompt_version)`. Bumping PROMPT_VERSION here triggers
 * re-classification of every reply on the next batch run.
 */

import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { chatJson, type ChatMessage } from "./openrouter.js";

/**
 * Bump this when the prompt content changes. Bumping triggers a re-classification
 * of every reply on the next batch run because of UNIQUE(reply_id, prompt_version).
 */
export const PROMPT_VERSION = "v1.0";

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
  praise_score: z.number().int().min(0).max(30),
  specificity_score: z.number().int().min(0).max(25),
  authenticity_score: z.number().int().min(0).max(25),
  standalone_score: z.number().int().min(0).max(20),
  is_high_quality: z.boolean(),
  categories: z.array(z.enum(CATEGORY_ENUM)),
  reasoning: z.string().min(1).max(2000),
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
 * Strip basic HTML so the model sees readable text. Smartlead reply bodies
 * are HTML; the model can sort of read HTML but cleaning helps both quality
 * and token count.
 */
export function stripHtml(html: string): string {
  return html
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
    .trim();
}

function buildUserMessage(input: ClassifyInput): string {
  const cleanBody = stripHtml(input.reply_body);
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
 * Defensive recompute: never trust the model's `is_high_quality` flag — derive
 * it from the sub-scores on our side. Catches the "praise_score=10 but flag=true"
 * inconsistency the prompt's BAD EXAMPLES warns the model about.
 */
function reconcileHighQuality(parsed: ClassifyResult): ClassifyResult {
  const total =
    parsed.praise_score +
    parsed.specificity_score +
    parsed.authenticity_score +
    parsed.standalone_score;
  return { ...parsed, is_high_quality: total >= HIGH_QUALITY_THRESHOLD };
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
  const raw = await chatJson<unknown>(messages, { temperature: 0.1, maxTokens: 600 });
  const parsed = ClassifyResultSchema.parse(raw);
  return reconcileHighQuality(parsed);
}
