import type { QuickLabel } from "./types.ts";

// Same preset set as plannotator's quick labels (packages/ui/utils/quickLabels.ts),
// so the feedback reads the same to an agent that already knows plannotator.
export const QUICK_LABELS: QuickLabel[] = [
  { id: "clarify-this", emoji: "❓", text: "Clarify this", color: "yellow" },
  { id: "missing-overview", emoji: "🗺️", text: "Missing overview", color: "purple", tip: "Provide a narrative overview of what is being built, why it is being built, and how it will be built. Add this before the implementation details." },
  { id: "verify-this", emoji: "🔍", text: "Verify this", color: "orange", tip: "This seems like an assumption. Verify by reading the actual code before proceeding." },
  { id: "give-me-an-example", emoji: "🔬", text: "Give me an example", color: "cyan", tip: "This is too abstract. Show a before/after, a sample input/output, or a specific scenario so I can see how this actually works." },
  { id: "match-existing-patterns", emoji: "🧬", text: "Match existing patterns", color: "teal", tip: "Search the codebase for existing patterns, components, or utilities that already solve this. Reuse what exists rather than introducing a new approach." },
  { id: "consider-alternatives", emoji: "🔄", text: "Consider alternatives", color: "pink", tip: "Propose 2-3 alternative approaches with trade-offs based on the actual codebase." },
  { id: "ensure-no-regression", emoji: "📉", text: "Ensure no regression", color: "amber", tip: "Verify that this change will not break existing behavior. Identify what could regress and how to protect against it." },
  { id: "out-of-scope", emoji: "🚫", text: "Out of scope", color: "red", tip: "This is not part of the current task. Remove it and stay focused on what was actually requested." },
  { id: "needs-tests", emoji: "🧪", text: "Needs tests", color: "blue" },
  { id: "nice-approach", emoji: "👍", text: "Looks good", color: "green" },
];
