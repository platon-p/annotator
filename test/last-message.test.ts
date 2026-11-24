import { expect, test } from "bun:test";
import { lastClaudeMessage, lastCodexMessage } from "../src/last-message";

const jl = (...xs: unknown[]) => xs.map((x) => JSON.stringify(x)).join("\n");

test("Claude: returns the text of the latest assistant reply, skipping tool calls and sidechains", () => {
  const t = jl(
    { type: "assistant", message: { content: [{ type: "text", text: "first" }] } },
    { type: "user", message: { content: "ok" } },
    { type: "assistant", message: { content: [{ type: "text", text: "final answer" }] } },
    { type: "assistant", message: { content: [{ type: "tool_use" }] } },
    { type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "subagent" }] } },
  );
  expect(lastClaudeMessage(t)).toBe("final answer");
});

test("Codex: returns the latest assistant output_text, ignoring user messages", () => {
  const msg = (role: string, text: string) => ({
    type: "response_item",
    payload: { type: "message", role, content: [{ type: role === "user" ? "input_text" : "output_text", text }] },
  });
  expect(lastCodexMessage(jl(msg("assistant", "a"), msg("assistant", "b"), msg("user", "q")))).toBe("b");
});

test("no assistant text gives null", () => {
  expect(lastClaudeMessage("")).toBeNull();
  expect(lastCodexMessage("not json")).toBeNull();
});
