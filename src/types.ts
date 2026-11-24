export interface QuickLabel {
  id: string;
  emoji: string;
  text: string;
  color: string;
  /** Instruction for the agent, printed in the feedback under the quote. */
  tip?: string;
}

export type AnnotationKind = "comment" | "delete" | "label" | "global";

export interface Annotation {
  id: number;
  kind: AnnotationKind;
  /** Selected text as rendered. Empty for global comments. */
  quote: string;
  /** 1-based source lines of the quote; null when it could not be located. */
  lineStart: number | null;
  lineEnd: number | null;
  /** Comment body (comment / global). */
  text?: string;
  label?: QuickLabel;
}
