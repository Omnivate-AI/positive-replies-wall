import { describe, it, expect, vi } from "vitest";
import { retry, isTransientFetchError } from "../../trigger/lib/retry.js";

describe("retry()", () => {
  it("returns the value on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const out = await retry(fn);
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxAttempts on retryable errors, then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("flaky");
      return "ok";
    });
    const out = await retry(fn, { baseDelayMs: 1, maxDelayMs: 1 });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws after exhausting maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always-fails"));
    await expect(retry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow("always-fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry when isRetryable returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent-bug"));
    await expect(
      retry(fn, { baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow("permanent-bug");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry callback for observability", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValue("ok");
    await retry(fn, { baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });
});

describe("isTransientFetchError()", () => {
  it("classifies TypeError (Node fetch network failure) as transient", () => {
    expect(isTransientFetchError(new TypeError("fetch failed"))).toBe(true);
  });

  it.each([
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "socket hang up",
    "fetch failed",
  ])("classifies %s in error message as transient", (msg) => {
    expect(isTransientFetchError(new Error(msg))).toBe(true);
  });

  it("does NOT classify a regular runtime error as transient", () => {
    expect(isTransientFetchError(new Error("invalid argument"))).toBe(false);
    expect(isTransientFetchError(new Error("unauthorized"))).toBe(false);
  });
});
