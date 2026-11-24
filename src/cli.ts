#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { formatFeedback } from "./feedback.ts";
import { startSession } from "./server.ts";

const USAGE = `annotator — review a markdown file in the browser, get feedback on stdout

Usage: annotator [--no-open] [--port N] <file.md>

  Opens the rendered file in the browser. Select text and comment or mark it
  from the keyboard (press ? in the page). Finish (Cmd/Ctrl+Enter) prints the
  annotations as markdown to stdout.

Exit codes: 0 finished (empty stdout = no annotations), 1 discarded, 2 usage/error.
Status messages go to stderr, so stdout stays pipeable.`;

function fail(msg: string): never {
  console.error(`annotator: ${msg}`);
  process.exit(2);
}

const args = process.argv.slice(2);
let file: string | undefined;
let noOpen = false;
let port: number | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "-h" || a === "--help") {
    console.log(USAGE);
    process.exit(0);
  } else if (a === "--no-open") noOpen = true;
  else if (a === "--port") {
    port = Number(args[++i]);
    if (!Number.isInteger(port) || port < 0 || port > 65535) fail("--port needs a number 0-65535");
  } else if (a.startsWith("-")) fail(`unknown option ${a}\n\n${USAGE}`);
  else if (file) fail("only one file is supported");
  else file = a;
}
if (!file) fail(`file is required\n\n${USAGE}`);

let content: string;
try {
  content = await readFile(file, "utf8");
} catch (e) {
  fail(`cannot read ${file}: ${(e as Error).message}`);
}

const session = await startSession({ file, content, port });
console.error(`annotator: ${session.url}`);
if (!noOpen) {
  const opener = process.env.BROWSER || (process.platform === "darwin" ? "open" : "xdg-open");
  spawn(opener, [session.url], { stdio: "ignore", detached: true }).on("error", () => console.error("annotator: could not open browser, open the URL above")).unref();
}

process.on("SIGINT", () => process.exit(130));

const result = await session.outcome;
// Let the page's fetch response flush before the server goes away.
setTimeout(() => session.stop(), 50);
if (result.status === "discarded") {
  console.error("annotator: discarded");
  process.exit(1);
}
process.stdout.write(formatFeedback(file, result.annotations));
setTimeout(() => process.exit(0), 100);
