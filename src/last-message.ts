import { Glob } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";

/** Text of the last assistant message in a Claude Code transcript (JSONL). */
export function lastClaudeMessage(jsonl: string): string | null {
  let last: string | null = null;
  for (const line of jsonl.split("\n")) {
    const e = parse(line);
    if (e?.type !== "assistant" || e.isSidechain) continue;
    const text = (e.message?.content ?? [])
      .filter((b: any) => b.type === "text" && b.text)
      .map((b: any) => b.text)
      .join("\n\n");
    if (text) last = text;
  }
  return last;
}

/** Text of the last assistant message in a Codex rollout (JSONL). */
export function lastCodexMessage(jsonl: string): string | null {
  let last: string | null = null;
  for (const line of jsonl.split("\n")) {
    const e = parse(line);
    const p = e?.payload;
    if (e?.type !== "response_item" || p?.type !== "message" || p.role !== "assistant") continue;
    const text = (p.content ?? [])
      .filter((b: any) => b.type === "output_text" && b.text)
      .map((b: any) => b.text)
      .join("\n\n");
    if (text) last = text;
  }
  return last;
}

function parse(line: string): any {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** Reads the last assistant message of an agent session; null when there is none. */
export async function readLastMessage(agent: string, sessionId: string): Promise<string | null> {
  if (!/^[\w-]+$/.test(sessionId)) throw new Error(`bad session id: ${sessionId}`);
  if (agent === "claude") {
    const file = await find(join(homedir(), ".claude/projects"), `*/${sessionId}.jsonl`);
    return lastClaudeMessage(await Bun.file(file).text());
  }
  if (agent === "codex") {
    const file = await find(join(homedir(), ".codex/sessions"), `**/*-${sessionId}.jsonl{,.zst}`);
    const text = file.endsWith(".zst")
      ? await new Response(Bun.spawn(["zstd", "-dc", file], { stdout: "pipe" }).stdout).text()
      : await Bun.file(file).text();
    return lastCodexMessage(text);
  }
  throw new Error(`unsupported agent: ${agent}`);
}

async function find(root: string, pattern: string): Promise<string> {
  for await (const f of new Glob(pattern).scan({ cwd: root, absolute: true })) return f;
  throw new Error(`no ${pattern} under ${root}`);
}

if (import.meta.main) {
  const [agent, sessionId] = process.argv.slice(2);
  if (!agent || !sessionId) {
    console.error("usage: last-message.ts <claude|codex> <session-id>");
    process.exit(2);
  }
  try {
    const msg = await readLastMessage(agent, sessionId);
    if (!msg) {
      console.error("no assistant message in the session");
      process.exit(1);
    }
    process.stdout.write(msg + "\n");
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
}
