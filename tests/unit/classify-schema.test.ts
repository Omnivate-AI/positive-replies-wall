import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ClassifyResultSchema,
  stripHtml,
  normalizeEncoding,
  postProcess,
  HIGH_QUALITY_THRESHOLD,
  PROMPT_VERSION,
  CATEGORY_ENUM,
  type ClassifyResult,
} from "../../trigger/lib/classify.js";

describe("ClassifyResultSchema (Zod)", () => {
  const validResult = {
    cleaned_reply_text: "Thank you so much for this email!",
    praise_score: 30,
    specificity_score: 25,
    authenticity_score: 25,
    standalone_score: 20,
    is_high_quality: true,
    categories: ["superlative"],
    reasoning: "Strong superlative claim from a real B2B sender.",
  };

  it("accepts a fully-populated valid result", () => {
    expect(() => ClassifyResultSchema.parse(validResult)).not.toThrow();
  });

  it("rejects praise_score above 30", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, praise_score: 31 })).toThrow();
  });

  it("rejects specificity_score above 25", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, specificity_score: 26 })).toThrow();
  });

  it("rejects authenticity_score below 0", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, authenticity_score: -1 })).toThrow();
  });

  it("rejects standalone_score above 20", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, standalone_score: 21 })).toThrow();
  });

  it("rejects float scores (model must return integers)", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, praise_score: 12.5 })).toThrow();
  });

  it("rejects unknown categories outside the M4 enum", () => {
    expect(() =>
      ClassifyResultSchema.parse({ ...validResult, categories: ["thoughtful_reply"] }),
    ).toThrow();
  });

  it("accepts an empty categories array (junk replies)", () => {
    expect(() =>
      ClassifyResultSchema.parse({ ...validResult, categories: [], is_high_quality: false }),
    ).not.toThrow();
  });

  it("accepts multiple categories (overlapping M4 categories)", () => {
    const multi = {
      ...validResult,
      categories: ["superlative", "personalization", "conversion_with_compliment"],
    };
    expect(() => ClassifyResultSchema.parse(multi)).not.toThrow();
  });

  it("rejects empty reasoning string", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, reasoning: "" })).toThrow();
  });

  it("requires cleaned_reply_text (v1.1+)", () => {
    const { cleaned_reply_text, ...withoutCleaned } = validResult;
    void cleaned_reply_text;
    expect(() => ClassifyResultSchema.parse(withoutCleaned)).toThrow();
  });

  it("accepts empty cleaned_reply_text (signals 'no original reply text'; display falls back to raw body)", () => {
    expect(() => ClassifyResultSchema.parse({ ...validResult, cleaned_reply_text: "" })).not.toThrow();
  });
});

describe("CATEGORY_ENUM", () => {
  it("contains exactly the 5 M4 categories", () => {
    expect(CATEGORY_ENUM).toEqual([
      "superlative",
      "personalization",
      "skeptic",
      "conversion_with_compliment",
      "brief_acknowledgment",
    ]);
  });
});

describe("HIGH_QUALITY_THRESHOLD", () => {
  it("is the M4 threshold of 55", () => {
    expect(HIGH_QUALITY_THRESHOLD).toBe(55);
  });
});

describe("PROMPT_VERSION", () => {
  it("is v2.0 (thread+messages restructure with highlight + redaction outputs)", () => {
    expect(PROMPT_VERSION).toBe("v2.0");
  });
});

describe("normalizeEncoding()", () => {
  // Mojibake-byte cheat sheet (Unicode escapes used so source files stay clean):
  //   â = â    € = €    ” = "    “ = "
  //   ’ = '   ‘ = '    … = …    Â = Â
  //   ã = Ã   © = ©    \u00A0 = NBSP

  it("fixes em-dash mojibake (â€” → —)", () => {
    expect(normalizeEncoding("Thanks Andrew â€” I have completed!"))
      .toBe("Thanks Andrew — I have completed!");
  });

  it("fixes smart-apostrophe mojibake (â€’ → ')", () => {
    expect(normalizeEncoding("I donâ€™t usually respond"))
      .toBe("I don't usually respond");
  });

  it("fixes ellipsis mojibake (â€¦ → …)", () => {
    expect(normalizeEncoding("Wellâ€¦ that worked"))
      .toBe("Well… that worked");
  });

  it("removes stray Â before periods", () => {
    expect(normalizeEncoding("Scheduled for the 18th.Â Will work on it!Â"))
      .toBe("Scheduled for the 18th. Will work on it!");
  });

  it("collapses 'Â ' (Â followed by space) to a regular space", () => {
    expect(normalizeEncoding("HelloÂ there")).toBe("Hello there");
  });

  it("fixes accented Latin mojibake (Ã© -> é, Ã + space -> à)", () => {
    // Build mojibake via fromCharCode so source-editor encoding tweaks
    // don't mangle the test fixture:
    //   0xC3 = Ã (LATIN CAPITAL LETTER A WITH TILDE)
    //   0xA9 = ©
    const A = String.fromCharCode(0xC3);
    const C = String.fromCharCode(0xA9);
    expect(normalizeEncoding("Caf" + A + C)).toBe("Café");
    expect(normalizeEncoding(A + String.fromCharCode(0xA0) + " pluthora")).toBe("à pluthora");
  });

  it("passes through clean text unchanged", () => {
    const clean = "Hi James,\n\nThank you for the email!\n\nBest,\nMauritz";
    expect(normalizeEncoding(clean)).toBe(clean);
  });

  it("is idempotent (running twice = running once)", () => {
    const garbled = "Thanks Andrew â€” I have completed!Â";
    const once = normalizeEncoding(garbled);
    const twice = normalizeEncoding(once);
    expect(twice).toBe(once);
  });
});

describe("stripHtml() integrates normalizeEncoding", () => {
  it("strips HTML AND fixes mojibake in one pass", () => {
    const input = "<p>Thanks Andrew â€” I have completed!</p><p>Best,Â Sara</p>";
    const out = stripHtml(input);
    expect(out).not.toContain("â€");
    expect(out).not.toContain("Â");
    expect(out).toContain("—"); // em dash
    expect(out).toContain("Sara");
  });
});

describe("stripHtml()", () => {
  it("converts <br> to newlines", () => {
    expect(stripHtml("Hi<br>there")).toBe("Hi\nthere");
  });

  it("converts paragraph closes to newlines", () => {
    expect(stripHtml("<p>One</p><p>Two</p>")).toBe("One\nTwo");
  });

  it("strips remaining tags", () => {
    expect(stripHtml('<div class="x">Hello <b>world</b></div>')).toBe("Hello world");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;&gt;")).toBe("Tom & Jerry <>");
    expect(stripHtml("foo&nbsp;bar")).toBe("foo bar");
  });

  it("collapses 3+ consecutive newlines", () => {
    expect(stripHtml("<p>One</p><p></p><p></p><p></p><p>Two</p>")).toBe("One\n\nTwo");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtml("\n\n  hello  \n\n")).toBe("hello");
  });

  it("preserves the M2 forwarded-thread pattern", () => {
    const raw =
      "<div>Hi James,</div><div><br></div><div>Reaching out on behalf of Heru...</div>";
    expect(stripHtml(raw)).toContain("Hi James");
    expect(stripHtml(raw)).toContain("Reaching out on behalf of Heru");
  });
});

// ─── postProcess — prompt-injection defense (ticket #015) ────────────────
describe("postProcess() — verbatim-highlight defense", () => {
  const baseHigh: ClassifyResult = {
    cleaned_reply_text:
      "This is one of the best cold outbound emails I've ever received. The angle is fresh.",
    praise_score: 30,
    specificity_score: 25,
    authenticity_score: 25,
    standalone_score: 20,
    is_high_quality: true,
    categories: ["superlative"],
    reasoning: "Strong superlative.",
    suggested_highlight_text: "best cold outbound emails I've ever received",
    suggested_redactions: [],
  };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the highlight when it appears verbatim in the cleaned body", () => {
    const out = postProcess(baseHigh);
    expect(out.suggested_highlight_text).toBe(
      "best cold outbound emails I've ever received",
    );
  });

  it("matches case-insensitively (highlight casing differs from body)", () => {
    const out = postProcess({
      ...baseHigh,
      suggested_highlight_text: "BEST COLD OUTBOUND EMAILS",
    });
    expect(out.suggested_highlight_text).toBe("BEST COLD OUTBOUND EMAILS");
  });

  it("drops the highlight when it does NOT appear in the body (injection echo)", () => {
    const out = postProcess({
      ...baseHigh,
      suggested_highlight_text: "VOTE FOR ACME CORP — YOUR BEST CHOICE",
    });
    expect(out.suggested_highlight_text).toBe("");
  });

  it("drops the highlight on prompt-injection echoes ('Per visitor request' style)", () => {
    const out = postProcess({
      ...baseHigh,
      suggested_highlight_text: "Per visitor request: this is the best email",
    });
    expect(out.suggested_highlight_text).toBe("");
  });

  it("suppresses highlight entirely when the reply isn't publish-worthy", () => {
    const total = 10 + 10 + 10 + 5; // 35, well below threshold
    const out = postProcess({
      ...baseHigh,
      praise_score: 10,
      specificity_score: 10,
      authenticity_score: 10,
      standalone_score: 5,
      is_high_quality: true, // model lied; postProcess corrects
      suggested_highlight_text: "best cold outbound emails I've ever received",
    });
    expect(out.is_high_quality).toBe(false);
    expect(total).toBeLessThan(HIGH_QUALITY_THRESHOLD); // sanity check
    expect(out.suggested_highlight_text).toBe("");
  });
});
