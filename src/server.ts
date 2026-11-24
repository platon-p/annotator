import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import { QUICK_LABELS } from "./labels.ts";
import type { Annotation } from "./types.ts";

export type Outcome = { status: "done"; annotations: Annotation[] } | { status: "discarded" };

export interface Session {
  url: string;
  /** Resolves when the page presses Finish or Discard. */
  outcome: Promise<Outcome>;
  stop(): void;
}

const webDir = new URL("../web/", import.meta.url);

async function bundle(): Promise<string> {
  const res = await Bun.build({ entrypoints: [new URL("app.ts", webDir).pathname], target: "browser", minify: false });
  if (!res.success) throw new Error(`frontend build failed:\n${res.logs.join("\n")}`);
  return res.outputs[0]!.text();
}

export async function startSession(opts: { file: string; content: string; port?: number }): Promise<Session> {
  const token = randomBytes(16).toString("hex");
  const [js, html, css] = await Promise.all([
    bundle(),
    Bun.file(new URL("index.html", webDir)).text(),
    Bun.file(new URL("style.css", webDir)).text(),
  ]);

  let settle!: (o: Outcome) => void;
  const outcome = new Promise<Outcome>((r) => (settle = r));

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      const text = (body: string, type: string) => new Response(body, { headers: { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" } });

      if (req.method === "GET" && url.pathname === "/") {
        if (url.searchParams.get("t") !== token) return new Response("forbidden", { status: 403 });
        return text(html, "text/html");
      }
      if (req.method === "GET" && url.pathname === "/app.js") return text(js, "text/javascript");
      if (req.method === "GET" && url.pathname === "/style.css") return text(css, "text/css");

      // Everything below mutates or reveals the document: require the session token,
      // so a random web page cannot talk to the local server.
      if (req.headers.get("x-token") !== token) return new Response("forbidden", { status: 403 });

      if (req.method === "GET" && url.pathname === "/api/doc") {
        return Response.json({ name: basename(opts.file), content: opts.content, labels: QUICK_LABELS });
      }
      if (req.method === "POST" && url.pathname === "/api/finish") {
        const body = (await req.json()) as { annotations: Annotation[] };
        settle({ status: "done", annotations: body.annotations ?? [] });
        return Response.json({ ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/discard") {
        settle({ status: "discarded" });
        return Response.json({ ok: true });
      }
      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}/?t=${token}`,
    outcome,
    stop: () => void server.stop(true),
  };
}
