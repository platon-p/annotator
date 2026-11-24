import { expect, test } from "bun:test";
import { formatFeedback } from "../src/feedback.ts";
import { QUICK_LABELS } from "../src/labels.ts";
import type { Annotation } from "../src/types.ts";

const base = { id: 1, quote: "q", lineStart: 3, lineEnd: 3 };

test("no annotations means no output", () => {
  expect(formatFeedback("a.md", [])).toBe("");
});

test("comment shows quote, location and body", () => {
  const a: Annotation = { ...base, kind: "comment", quote: "bad claim", text: "Source?" };
  expect(formatFeedback("a.md", [a])).toBe(
    "# Feedback on a.md\n\n## 1. Comment — line 3\n\n> bad claim\n\nSource?\n",
  );
});

test("multi-line quote stays one blockquote and line range is printed", () => {
  const a: Annotation = { ...base, kind: "delete", quote: "a\n\nb", lineStart: 2, lineEnd: 5 };
  const out = formatFeedback("a.md", [a]);
  expect(out).toContain("## 1. Remove this — lines 2–5");
  expect(out).toContain("> a\n>\n> b");
});

test("quick label carries its instruction for the agent", () => {
  const label = QUICK_LABELS.find((l) => l.id === "verify-this")!;
  const out = formatFeedback("a.md", [{ ...base, kind: "label", label }]);
  expect(out).toContain("## 1. 🔍 Verify this — line 3");
  expect(out).toContain(label.tip!);
});

test("label without tip prints just the label", () => {
  const label = QUICK_LABELS.find((l) => l.id === "nice-approach")!;
  const out = formatFeedback("a.md", [{ ...base, kind: "label", label }]);
  expect(out.trimEnd().endsWith("> q")).toBe(true);
});

test("global comment has no quote", () => {
  const out = formatFeedback("a.md", [
    { id: 2, kind: "global", quote: "", lineStart: null, lineEnd: null, text: "Overall too long" },
  ]);
  expect(out).toBe("# Feedback on a.md\n\n## 1. General comment\n\nOverall too long\n");
});
