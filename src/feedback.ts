import type { Annotation } from "./types.ts";

const MAX_QUOTE = 1000;

function lines(a: Annotation): string {
  if (a.lineStart == null) return "";
  if (a.lineEnd == null || a.lineEnd === a.lineStart) return ` — line ${a.lineStart}`;
  return ` — lines ${a.lineStart}–${a.lineEnd}`;
}

function quote(q: string): string {
  const t = q.length > MAX_QUOTE ? `${q.slice(0, MAX_QUOTE)}…` : q;
  return t
    .split("\n")
    .map((l) => `> ${l}`.trimEnd())
    .join("\n");
}

/**
 * Markdown feedback ready to paste into an agent prompt.
 * Empty string when there are no annotations (nothing to say = all fine).
 */
export function formatFeedback(file: string, annotations: Annotation[]): string {
  if (annotations.length === 0) return "";
  const out: string[] = [`# Feedback on ${file}`, ""];
  let n = 0;
  for (const a of annotations) {
    n++;
    if (a.kind === "global") {
      out.push(`## ${n}. General comment`, "", (a.text ?? "").trim(), "");
      continue;
    }
    const title =
      a.kind === "delete"
        ? "Remove this"
        : a.kind === "label" && a.label
          ? `${a.label.emoji} ${a.label.text}`
          : "Comment";
    out.push(`## ${n}. ${title}${lines(a)}`, "", quote(a.quote), "");
    if (a.kind === "delete") out.push("Remove this passage.", "");
    else if (a.kind === "label" && a.label?.tip) out.push(a.label.tip, "");
    else if (a.kind === "comment") out.push((a.text ?? "").trim(), "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
