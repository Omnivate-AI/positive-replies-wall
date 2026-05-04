import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listClients, uniboxUrl } from "../../trigger/lib/smartlead.js";
import { mockResponse } from "../_helpers/fixtures.js";

describe("uniboxUrl()", () => {
  it("builds the canonical Smartlead unibox deep link from campaign_lead_map_id", () => {
    expect(uniboxUrl(2603762462)).toBe(
      "https://app.smartlead.ai/app/master-inbox?leadMap=2603762462",
    );
  });
});

describe("slGet retry semantics (via listClients)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.SMARTLEAD_API_KEY = "test-key-only-used-for-mock";
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns immediately on a 200", async () => {
    fetchMock.mockResolvedValue(mockResponse(200, [{ id: 1, name: "A", email: "a@x.com" }]));
    const out = await listClients();
    expect(out).toEqual([{ id: 1, name: "A", email: "a@x.com" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(500, "ECONNRESET"))
      .mockResolvedValueOnce(mockResponse(500, "still flaky"))
      .mockResolvedValueOnce(mockResponse(200, [{ id: 7, name: "ok", email: null }]));
    const out = await listClients();
    expect(out).toEqual([{ id: 7, name: "ok", email: null }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 30_000);

  it("retries on 429 (rate limited)", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, "rate limited"))
      .mockResolvedValueOnce(mockResponse(200, []));
    const out = await listClients();
    expect(out).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("does NOT retry on 404 — that's a bug, not flakiness", async () => {
    fetchMock.mockResolvedValue(mockResponse(404, "not found"));
    await expect(listClients()).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 401 — auth bug, not flakiness", async () => {
    fetchMock.mockResolvedValue(mockResponse(401, "unauthorized"));
    await expect(listClients()).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on TCP-level network errors (TypeError thrown by fetch)", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(mockResponse(200, []));
    const out = await listClients();
    expect(out).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("gives up after MAX_ATTEMPTS and surfaces the error", async () => {
    fetchMock.mockResolvedValue(mockResponse(503, "down"));
    await expect(listClients()).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(4); // MAX_ATTEMPTS = 4
  }, 30_000);
});
