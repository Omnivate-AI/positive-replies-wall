import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chat, chatJson, DEFAULT_MODEL } from "../../trigger/lib/openrouter.js";
import { mockResponse } from "../_helpers/fixtures.js";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.OPENROUTER_API_KEY = "test-key-for-mock";
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function chatCompletion(content: string, finishReason = "stop"): Response {
  return mockResponse(200, {
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { total_tokens: 100 },
  });
}

describe("DEFAULT_MODEL", () => {
  it("is the locked Omnivate default xiaomi/mimo-v2-flash", () => {
    expect(DEFAULT_MODEL).toBe("xiaomi/mimo-v2-flash");
  });
});

describe("chat()", () => {
  it("returns the assistant content on a 200", async () => {
    fetchMock.mockResolvedValue(chatCompletion("hello world"));
    const out = await chat([{ role: "user", content: "say hi" }]);
    expect(out).toBe("hello world");
  });

  it("retries on 500 and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(503, "down"))
      .mockResolvedValueOnce(chatCompletion("recovered"));
    const out = await chat([{ role: "user", content: "x" }]);
    expect(out).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("retries on 429 (rate limited)", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, "rate-limited"))
      .mockResolvedValueOnce(chatCompletion("ok"));
    const out = await chat([{ role: "user", content: "x" }]);
    expect(out).toBe("ok");
  }, 15_000);

  it("does NOT retry on 400 (bad request — fail fast)", async () => {
    fetchMock.mockResolvedValue(mockResponse(400, "bad"));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 401 (auth — fail fast)", async () => {
    fetchMock.mockResolvedValue(mockResponse(401, "unauthorized"));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on TCP-level network errors", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(chatCompletion("ok"));
    const out = await chat([{ role: "user", content: "x" }]);
    expect(out).toBe("ok");
  }, 15_000);

  it("throws when assistant content is empty", async () => {
    fetchMock.mockResolvedValue(chatCompletion(""));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/empty assistant/i);
  });

  it("includes model + temperature + messages in the request body", async () => {
    fetchMock.mockResolvedValue(chatCompletion("ok"));
    await chat([{ role: "user", content: "hi" }], { temperature: 0.5, model: "test/model" });
    const callArgs = fetchMock.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe("test/model");
    expect(body.temperature).toBe(0.5);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("uses the default model when none specified", async () => {
    fetchMock.mockResolvedValue(chatCompletion("ok"));
    await chat([{ role: "user", content: "hi" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(DEFAULT_MODEL);
  });
});

describe("chatJson()", () => {
  it("parses raw JSON content", async () => {
    fetchMock.mockResolvedValue(chatCompletion('{"score": 95, "ok": true}'));
    const out = await chatJson<{ score: number; ok: boolean }>([{ role: "user", content: "x" }]);
    expect(out).toEqual({ score: 95, ok: true });
  });

  it("strips ```json ... ``` markdown fences defensively", async () => {
    fetchMock.mockResolvedValue(chatCompletion('```json\n{"score": 80}\n```'));
    const out = await chatJson<{ score: number }>([{ role: "user", content: "x" }]);
    expect(out).toEqual({ score: 80 });
  });

  it("strips bare ``` fences", async () => {
    fetchMock.mockResolvedValue(chatCompletion('```\n{"score": 70}\n```'));
    const out = await chatJson<{ score: number }>([{ role: "user", content: "x" }]);
    expect(out).toEqual({ score: 70 });
  });

  it("throws an informative error on invalid JSON", async () => {
    fetchMock.mockResolvedValue(chatCompletion("not json at all"));
    await expect(chatJson([{ role: "user", content: "x" }])).rejects.toThrow(
      /not valid JSON/i,
    );
  });
});
