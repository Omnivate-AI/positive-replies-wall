import { describe, it, expect } from "vitest";
import {
  ClassifyResultSchema,
  stripHtml,
  HIGH_QUALITY_THRESHOLD,
  PROMPT_VERSION,
  CATEGORY_ENUM,
} from "../../trigger/lib/classify.js";

describe("ClassifyResultSchema (Zod)", () => {
  const validResult = {
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
  it("starts at v1.0", () => {
    expect(PROMPT_VERSION).toBe("v1.0");
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
