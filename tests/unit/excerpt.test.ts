import { describe, it, expect } from "vitest";
import { buildExcerpt } from "../../lib/excerpt.js";

describe("buildExcerpt", () => {
  it("splits body cleanly into before/highlight/after when highlight is found", () => {
    const body =
      "Hi Andrew, this is a killer email — best one I've gotten in years. Looking forward to chatting.";
    const r = buildExcerpt(body, "this is a killer email");
    expect(r.before).toBe("Hi Andrew, ");
    expect(r.highlight).toBe("this is a killer email");
    expect(r.after.length).toBeLessThanOrEqual(80);
    expect(r.after.startsWith(" — best")).toBe(true);
  });

  it("trailing tail is capped at 80 chars and marks truncated=true when body extends further", () => {
    const after = "x".repeat(120);
    const body = `start ${"highlight"} ${after}`;
    const r = buildExcerpt(body, "highlight");
    expect(r.after.length).toBe(80);
    expect(r.truncated).toBe(true);
  });

  it("does not mark truncated when remaining body fits within 80 chars", () => {
    const body = "Lead-in. The killer email line. Brief tail.";
    const r = buildExcerpt(body, "The killer email line.");
    expect(r.truncated).toBe(false);
    expect(r.after).toBe(" Brief tail.");
  });

  it("highlight at the very start yields empty before", () => {
    const body = "Killer email. The rest follows.";
    const r = buildExcerpt(body, "Killer email.");
    expect(r.before).toBe("");
    expect(r.highlight).toBe("Killer email.");
    expect(r.after).toBe(" The rest follows.");
  });

  it("falls back to body-start excerpt when highlight is null", () => {
    const body = "Some reply text we should still display.";
    const r = buildExcerpt(body, null);
    expect(r.before).toBe("");
    expect(r.highlight).toBe("");
    expect(r.after).toBe(body);
    expect(r.truncated).toBe(false);
  });

  it("falls back to body-start excerpt when highlight is empty string", () => {
    const body = "Reply.";
    const r = buildExcerpt(body, "");
    expect(r.highlight).toBe("");
    expect(r.after).toBe("Reply.");
  });

  it("fallback truncates at 200 chars + flags truncated", () => {
    const body = "x".repeat(500);
    const r = buildExcerpt(body, null);
    expect(r.after.length).toBe(200);
    expect(r.truncated).toBe(true);
  });

  it("matches case-insensitively when an exact match fails", () => {
    const body = "Hi James, this is a killer email indeed.";
    const r = buildExcerpt(body, "This Is A Killer Email"); // model title-cased
    expect(r.highlight).toBe("this is a killer email");
    expect(r.before).toBe("Hi James, ");
  });

  it("falls back when highlight is genuinely not present", () => {
    const body = "Hi James, thanks for reaching out.";
    const r = buildExcerpt(body, "this is a killer email");
    expect(r.before).toBe("");
    expect(r.highlight).toBe("");
    expect(r.after).toBe(body);
  });

  it("preserves multi-line bodies in the after segment (line breaks survive)", () => {
    const body = "Hi Omar,\n\nThis is a killer email.\n\nLet's chat.";
    const r = buildExcerpt(body, "This is a killer email.");
    expect(r.before).toContain("Hi Omar");
    expect(r.before).toContain("\n\n");
    expect(r.after.startsWith("\n\nLet")).toBe(true);
  });

  it("falls back to a sentence-fragment when classifier stitched non-contiguous sentences", () => {
    // Real case from thread 185: classifier returned "You pulled me in. You
    // win. I appreciate you reading my post and actually sending me an email
    // that praises me with a follow-up that matters. Well done from a
    // content perspective." but the body has those phrases separated by
    // intervening text.
    const body =
      "Hi Andrew,\n\nYou pulled me in. You win. I will let you give me a free report. I know it is big of me.\n\nLet's do and I appreciate you reading my post and actually sending me an email that praises me with a follow-up that matters. Well done from a content perspective.\n\nCheers and looking forward to chatting.";
    const stitched =
      "You pulled me in. You win. I appreciate you reading my post and actually sending me an email that praises me with a follow-up that matters. Well done from a content perspective.";
    const r = buildExcerpt(body, stitched);
    // The stitched string isn't a substring of the body, so the verbatim
    // and case-insensitive matches both fail. The fallback picks the
    // longest sentence-fragment that DOES match — "I appreciate you
    // reading my post and actually sending me an email that praises me
    // with a follow-up that matters." This is meaningful praise, not a
    // body-start truncation.
    expect(r.highlight.length).toBeGreaterThan(0);
    expect(body.includes(r.highlight)).toBe(true);
    expect(r.highlight).toContain("appreciate you reading my post");
    // And it's NOT the original stitched string
    expect(r.highlight).not.toBe(stitched);
  });

  it("handles empty body gracefully", () => {
    const r = buildExcerpt("", "anything");
    expect(r.before).toBe("");
    expect(r.highlight).toBe("");
    expect(r.after).toBe("");
    expect(r.truncated).toBe(false);
  });
});
