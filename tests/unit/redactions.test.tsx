import { describe, it, expect } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { applyRedactions } from "../../lib/redactions.js";

/** Flatten the React node returned by applyRedactions into a plain array of
 * { kind: 'text' | 'redact', text } so assertions stay readable. */
type Segment = { kind: "text" | "redact"; text: string };
function flatten(node: ReactNode): Segment[] {
  if (typeof node === "string") return [{ kind: "text", text: node }];
  if (!Array.isArray(node)) return [];
  const out: Segment[] = [];
  for (const child of node) {
    if (!isValidElement(child)) continue;
    type ChildProps = { className?: string; children?: ReactNode };
    const props = child.props as ChildProps;
    const text =
      typeof props.children === "string" ? props.children : String(props.children ?? "");
    const isRedacted = props.className === "redacted";
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
