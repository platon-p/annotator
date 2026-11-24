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

export interface SessionRef {
  /** Exact session id when herdr knows it. */
  sessionId?: string;
  /** Pane working directory; used to pick the newest session when the id is unknown. */
  cwd?: string;
}

/** Reads the last assistant message of an agent session; null when there is none. */
export async function readLastMessage(agent: string, ref: SessionRef): Promise<string | null> {
  try {
    return await readExact(agent, ref);
  } catch (e) {
    // herdr can hold a session id that has no transcript on disk; fall back to the newest one in the cwd.
    if (!ref.sessionId || !ref.cwd) throw e;
    return readExact(agent, { cwd: ref.cwd });
  }
}

async function readExact(agent: string, ref: SessionRef): Promise<string | null> {
  const { sessionId, cwd } = ref;
  if (sessionId && !/^[\w-]+$/.test(sessionId)) throw new Error(`bad session id: ${sessionId}`);
  if (!sessionId && !cwd) throw new Error("need a session id or a cwd");
  if (agent === "claude") {
    const root = join(homedir(), ".claude/projects");
    const file = sessionId
      ? await newest(root, `*/${sessionId}.jsonl`)
      : await newest(join(root, cwd!.replace(/[^A-Za-z0-9]/g, "-")), "*.jsonl");
    return lastClaudeMessage(await Bun.file(file).text());
  }
  if (agent === "codex") {
    const root = join(homedir(), ".codex/sessions");
    const file = sessionId
      ? await newest(root, `**/*-${sessionId}.jsonl{,.zst}`)
      : await newestCodexIn(root, cwd!);
    const text = file.endsWith(".zst")
      ? await new Response(Bun.spawn(["zstd", "-dc", file], { stdout: "pipe" }).stdout).text()
      : await Bun.file(file).text();
    return lastCodexMessage(text);
  }
  throw new Error(`unsupported agent: ${agent}`);
}

async function candidates(root: string, pattern: string) {
  const out: { file: string; mtime: number }[] = [];
  for await (const file of new Glob(pattern).scan({ cwd: root, absolute: true })) {
    out.push({ file, mtime: (await Bun.file(file).stat()).mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime).map((c) => c.file);
}

async function newest(root: string, pattern: string): Promise<string> {
  const [f] = await candidates(root, pattern);
  if (!f) throw new Error(`no ${pattern} under ${root}`);
  return f;
}

/** Newest live Codex rollout whose session_meta.cwd is `cwd`. */
async function newestCodexIn(root: string, cwd: string): Promise<string> {
  for (const file of (await candidates(root, "**/rollout-*.jsonl")).slice(0, 300)) {
    const head = await Bun.file(file).slice(0, 8192).text();
    const m = head.match(/"cwd":("(?:[^"\\]|\\.)*")/);
    if (m && JSON.parse(m[1]) === cwd) return file;
  }
  throw new Error(`no recent codex session for ${cwd}`);
}

if (import.meta.main) {
  const [agent, ...rest] = process.argv.slice(2);
  const opt = (name: string) => {
    const i = rest.indexOf(name);
    return i < 0 ? undefined : rest[i + 1] || undefined;
  };
  if (!agent || (!opt("--session") && !opt("--cwd"))) {
    console.error("usage: last-message.ts <claude|codex> [--session ID] [--cwd DIR]");
    process.exit(2);
  }
  try {
    const msg = await readLastMessage(agent, { sessionId: opt("--session"), cwd: opt("--cwd") });
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
