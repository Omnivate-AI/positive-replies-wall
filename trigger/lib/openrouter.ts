/**
 * OpenRouter chat completion helper.
 *
 * Auth: OPENROUTER_API_KEY (env var, also synced to Trigger.dev).
 * Default model: xiaomi/mimo-v2-flash (the cheap-fast Omnivate default — see
 *   memory/feedback_smartlead_cli_first.md and brief §5: never change without
 *   explicit permission).
 *
 * Retry semantics mirror trigger/lib/smartlead.ts: retry on 5xx/429/network
 * errors, fail fast on 4xx (bug-shaped, not flaky-shaped).
 */

import { retry, isTransientFetchError } from "./retry.js";

const OR_BASE = "https://openrouter.ai/api/v1";

/** Omnivate's locked default model. Do not change without permission (brief §5). */
export const DEFAULT_MODEL = "xiaomi/mimo-v2-flash";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When true, request JSON-mode from the model (recommended for structured output). */
  jsonMode?: boolean;
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  return key;
}

/**
 * Low-level chat completion. Returns the raw assistant content string.
 * Throws on auth/4xx, retries on transient errors, validates response shape.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 800,
    messages,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  return retry(
    async () => {
      let res: Response;
      try {
        res = await fetch(`${OR_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // OpenRouter recommends these for analytics; harmless if missing.
            "HTTP-Referer": "https://github.com/Omnivate-AI/positive-replies-wall",
            "X-Title": "positive-replies-wall",
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        // Network-level failure — wrap so retry sees it as TypeError.
        throw new TypeError(`OpenRouter network error: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const isTransient = res.status >= 500 || res.status === 429;
        const err = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
        // Only let retry catch transient errors; rethrow 4xx fatally.
        if (!isTransient) {
          (err as Error & { __nonRetryable?: boolean }).__nonRetryable = true;
        }
        throw err;
      }

      const data = (await res.json()) as ChatResponse;
      if (data.error) throw new Error(`OpenRouter API error: ${data.error.message ?? "unknown"}`);
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new Error("OpenRouter returned empty assistant content");
      }
      return content;
    },
    {
      maxAttempts: 4,
      baseDelayMs: 500,
      isRetryable: (e) => {
        if (e && typeof e === "object" && "__nonRetryable" in e) return false;
        const msg = e instanceof Error ? e.message : "";
        return (
          isTransientFetchError(e) ||
          // HTTP-status-shaped errors
          /\b5\d{2}\b|\b429\b/.test(msg) ||
          // OpenRouter sometimes returns HTTP 200 with `{error: {message: "Internal Server Error"}}`
          // in the body — these are transient. Match common upstream-flake phrases.
          /Internal Server Error|Service Unavailable|Bad Gateway|Gateway Timeout|empty assistant content|OpenRouter API error/i.test(msg)
        );
      },
    },
  );
}

/**
 * Chat completion that expects a JSON-shaped string back. Strips a leading
 * markdown fence if the model produces one (some models still do despite
 * the system prompt asking for raw JSON), then parses.
 */
export async function chatJson<T = unknown>(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<T> {
  const raw = await chat(messages, { ...opts, jsonMode: opts.jsonMode ?? true });
  let cleaned = raw.trim();
  // Defensive: strip ```json ... ``` fences if the model added them.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(
      `OpenRouter response was not valid JSON: ${(e as Error).message}\nFirst 300 chars: ${cleaned.slice(0, 300)}`,
    );
  }
}
