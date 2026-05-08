import { describe, it, expect } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { applyRedactions, inferMatchType } from "../../lib/redactions.js";

/** Flatten the React node returned by applyRedactions into a plain array of
 * { kind: 'text' | 'redact', text } so assertions stay readable.
 *
 * Redaction spans now have a nested `<span class="redacted-text">` inside
 * the outer `<span class="redacted">` (the inner span carries the blur,
 * the outer carries the pill background — see `.redacted` in globals.css).
 * `extractText` walks the tree to pull out the leaf text regardless of
 * nesting depth so assertions don't have to know about that structure. */
type Segment = { kind: "text" | "redact"; text: string };
function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (isValidElement(children)) {
    return extractText((children.props as { children?: ReactNode }).children);
  }
  return "";
}

function flatten(node: ReactNode): Segment[] {
  if (typeof node === "string") return [{ kind: "text", text: node }];
  if (!Array.isArray(node)) return [];
  const out: Segment[] = [];
  for (const child of node) {
    if (!isValidElement(child)) continue;
    type ChildProps = { className?: string; children?: ReactNode };
    const props = child.props as ChildProps;
    const isRedacted = props.className === "redacted";
    const text = extractText(props.children);
    out.push({ kind: isRedacted ? "redact" : "text", text });
  }
  return out;
}

describe("applyRedactions", () => {
  it("returns the original string when redactions list is empty", () => {
    expect(applyRedactions("Hello world", [])).toBe("Hello world");
  });

  it("returns the original string when redactions array contains only empty strings", () => {
    expect(applyRedactions("Hello world", ["", "  ".trim()])).toBe("Hello world");
  });

  it("wraps a single match in a redacted span", () => {
    const out = flatten(applyRedactions("Hi Mark, thanks!", ["Mark"]));
    expect(out).toEqual([
      { kind: "text", text: "Hi " },
      { kind: "redact", text: "Mark" },
      { kind: "text", text: ", thanks!" },
    ]);
  });

  it("matches case-insensitively", () => {
    const out = flatten(applyRedactions("hi MARK", ["mark"]));
    expect(out).toEqual([
      { kind: "text", text: "hi " },
      { kind: "redact", text: "MARK" },
    ]);
  });

  it("wraps every occurrence", () => {
    const out = flatten(applyRedactions("Mark and Mark again", ["Mark"]));
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["Mark", "Mark"]);
  });

  it("longest-first ordering: 'Mauritz Gilfillan' wins over 'Mauritz'", () => {
    const out = flatten(
      applyRedactions("From Mauritz Gilfillan today", ["Mauritz", "Mauritz Gilfillan"]),
    );
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["Mauritz Gilfillan"]);
  });

  it("escapes regex specials in redaction strings", () => {
    const out = flatten(applyRedactions("Visit example.com today", ["example.com"]));
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["example.com"]);
    // The dot must NOT have matched a generic character — confirm by checking
    // no other span fired.
    expect(reds.length).toBe(1);
  });

  it("handles parens, brackets, plus signs without throwing", () => {
    expect(() =>
      applyRedactions("a (b) c [d] e + f", ["(b)", "[d]", "+"]),
    ).not.toThrow();
  });

  it("dedupes identical redactions", () => {
    const out = flatten(applyRedactions("Heru is at Heru", ["Heru", "Heru"]));
    const reds = out.filter((s) => s.kind === "redact");
    expect(reds.length).toBe(2); // two occurrences in the text
    expect(reds.every((s) => s.text === "Heru")).toBe(true);
  });

  it("returns a single text segment with the original string when nothing matches", () => {
    const out = flatten(applyRedactions("Hello world", ["Zebra"]));
    expect(out).toEqual([{ kind: "text", text: "Hello world" }]);
  });

  it("preserves text at the start and end of the string", () => {
    const out = flatten(applyRedactions("Mark goes home with Mark", ["Mark"]));
    expect(out[0]).toEqual({ kind: "redact", text: "Mark" });
    expect(out[out.length - 1]).toEqual({ kind: "redact", text: "Mark" });
  });
});

// Word-boundary mode (ticket #013): short single-token names must not
// substring-leak into unrelated words.
describe("applyRedactions — word_boundary mode", () => {
  it("`Ed` (word_boundary) does NOT mask `editor`", () => {
    const out = flatten(
      applyRedactions("Hi Ed, the editor said yes.", [
        { text: "Ed", match_type: "word_boundary" },
      ]),
    );
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    // Only the standalone "Ed" should be masked. "editor" must survive intact.
    expect(reds).toEqual(["Ed"]);
    const text = out
      .filter((s) => s.kind === "text")
      .map((s) => s.text)
      .join("");
    expect(text).toContain("editor");
  });

  it("`Lee` (word_boundary) does NOT mask `feeling`, `Greeley`, or `tunneling`", () => {
    const out = flatten(
      applyRedactions("Lee was feeling fine in Greeley while tunneling.", [
        { text: "Lee", match_type: "word_boundary" },
      ]),
    );
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["Lee"]);
  });

  it("`Apple` (word_boundary) does NOT mask `pineapple` or `dapple`", () => {
    const out = flatten(
      applyRedactions("Apple is not pineapple and dapple isn't either.", [
        { text: "Apple", match_type: "word_boundary" },
      ]),
    );
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["Apple"]);
  });

  it("`eli@xyz.com` (literal) still masks the full email amid punctuation", () => {
    const out = flatten(
      applyRedactions("Reach me at (eli@xyz.com), thanks.", [
        { text: "eli@xyz.com", match_type: "literal" },
      ]),
    );
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["eli@xyz.com"]);
  });

  it("backwards-compat: bare strings are treated as literal", () => {
    // "Ed" passed as a bare string (legacy) IS a substring match — masks
    // the "ed" inside "editor". This is the M9-era behavior; new typed
    // callers can opt out by passing { text, match_type: "word_boundary" }.
    // Case-insensitive match returns the matched span (source case), so
    // "ed" — not "Ed" — is the redacted text here.
    const out = flatten(applyRedactions("the editor", ["Ed"]));
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["ed"]);
  });

  it("mixed inputs (typed + string) compose correctly", () => {
    const out = flatten(
      applyRedactions("Lee replied. Apple is delicious.", [
        { text: "Lee", match_type: "word_boundary" },
        "Apple", // literal via legacy form
      ]),
    );
    const reds = out.filter((s) => s.kind === "redact").map((s) => s.text);
    expect(reds).toEqual(["Lee", "Apple"]);
  });
});

describe("inferMatchType()", () => {
  it("single-token names → word_boundary", () => {
    expect(inferMatchType("Lee")).toBe("word_boundary");
    expect(inferMatchType("Mauritz")).toBe("word_boundary");
    expect(inferMatchType("Apple")).toBe("word_boundary");
  });

  it("multi-token strings → literal", () => {
    expect(inferMatchType("Mauritz Gilfillan")).toBe("literal");
    expect(inferMatchType("Apple Inc")).toBe("literal");
  });

  it("strings with `@` or `.` → literal (emails, domains)", () => {
    expect(inferMatchType("eli@xyz.com")).toBe("literal");
    expect(inferMatchType("example.com")).toBe("literal");
    expect(inferMatchType("foo.bar")).toBe("literal");
  });
});
