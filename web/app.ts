import { Marked, type Token, type Tokens } from "marked";
import type { Annotation, QuickLabel } from "../src/types.ts";

// ---------- state ----------
const token = new URLSearchParams(location.search).get("t") ?? "";
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const doc = $("doc");
const docwrap = $("docwrap");
const caretEl = $("caret");
const composer = $("composer");
const cText = $<HTMLTextAreaElement>("c-text");

let labels: QuickLabel[] = [];
let fileName = "";
let blocks: { raw: string; line: number }[] = [];
const anns: Annotation[] = [];
let seq = 0;
let navId: number | null = null; // annotation selected via [ / ]
let lastRange: Range | null = null; // last selection inside the document
let modalOpen = false;
let finished = false;

const api = async (path: string, body?: unknown) => {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-token": token, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
};

// ---------- render ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Agent reports may contain raw HTML; never let it run in this origin.
const md = new Marked({ renderer: { html: (t: Tokens.HTML | Tokens.Tag) => esc(t.text) } });

function render(content: string) {
  const tokens = md.lexer(content);
  let line = 1;
  let html = "";
  blocks = [];
  for (const t of tokens as Token[]) {
    if (t.type !== "space") {
      const part = Object.assign([t], { links: tokens.links });
      html += `<section class="blk" data-i="${blocks.length}">${md.parser(part as never)}</section>`;
      blocks.push({ raw: t.raw.replace(/\n+$/, ""), line });
    }
    line += (t.raw.match(/\n/g) ?? []).length;
  }
  doc.innerHTML = html;
}

// ---------- outline ----------
let headings: HTMLElement[] = [];
let tocItems: HTMLElement[] = [];

function buildOutline() {
  headings = [...doc.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")];
  const toc = $("toc");
  toc.textContent = "";
  const minLevel = Math.min(...headings.map((h) => Number(h.tagName[1])), 6);
  tocItems = headings.map((h) => {
    const li = document.createElement("li");
    li.textContent = h.textContent ?? "";
    li.title = h.textContent ?? "";
    li.style.paddingLeft = `${8 + (Number(h.tagName[1]) - minLevel) * 12}px`;
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => gotoHeading(h));
    toc.append(li);
    return li;
  });
}

function updateOutline() {
  const s = sel();
  if (!headings.length || !s.focusNode || !inDoc(s.focusNode)) return;
  let cur = -1;
  headings.forEach((h, i) => {
    if (h === s.focusNode || h.contains(s.focusNode) || h.compareDocumentPosition(s.focusNode!) & Node.DOCUMENT_POSITION_FOLLOWING) cur = i;
  });
  tocItems.forEach((li, i) => li.classList.toggle("active", i === cur));
  tocItems[cur]?.scrollIntoView({ block: "nearest" });
}

function gotoHeading(h: HTMLElement) {
  const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  const t = w.nextNode() as Text | null;
  if (t) sel().collapse(t, 0);
  navId = null;
  window.scrollTo(0, window.scrollY + h.getBoundingClientRect().top - 70);
  updateCaret();
  refresh();
}

/** Index of the last heading at or before the caret, -1 if none. */
function currentHeading(): number {
  const s = sel();
  let cur = -1;
  if (!s.focusNode || !inDoc(s.focusNode)) return cur;
  headings.forEach((h, i) => {
    if (h.contains(s.focusNode) || h.compareDocumentPosition(s.focusNode!) & Node.DOCUMENT_POSITION_FOLLOWING) cur = i;
  });
  return cur;
}

/** Next/previous heading; "previous" from inside a section body goes to that section's heading first. */
function headingStep(dir: 1 | -1) {
  const cur = currentHeading();
  const inHeading = cur >= 0 && headings[cur]!.contains(sel().focusNode);
  const target = dir === 1 ? cur + 1 : inHeading || cur < 0 ? cur - 1 : cur;
  const h = headings[target];
  if (h) gotoHeading(h);
}

// ---------- selection helpers ----------
const sel = () => window.getSelection()!;
const inDoc = (n: Node | null) => !!n && doc.contains(n);
const elOf = (n: Node) => (n.nodeType === 3 ? n.parentElement! : (n as HTMLElement));

function firstText(): Text | null {
  const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) if ((n as Text).data.trim()) return n as Text;
  return null;
}

function restoreSelection() {
  const s = sel();
  if (lastRange) {
    s.removeAllRanges();
    s.addRange(lastRange.cloneRange());
  } else {
    const t = firstText();
    if (t) s.collapse(t, 0);
  }
}

function rectOf(node: Node, offset: number): DOMRect | null {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  const rects = r.getClientRects();
  const rect = rects.length ? rects[0]! : r.getBoundingClientRect();
  if (rect.height > 0) return rect;
  const el = elOf(node).getBoundingClientRect();
  return el.height > 0 ? el : null;
}

function updateCaret() {
  const s = sel();
  if (!s.rangeCount || !inDoc(s.focusNode)) return;
  lastRange = s.getRangeAt(0).cloneRange();
  updateOutline();
  if (!s.isCollapsed) {
    caretEl.hidden = true;
    return;
  }
  const rect = rectOf(s.focusNode!, s.focusOffset);
  if (!rect) {
    caretEl.hidden = true;
    return;
  }
  const w = docwrap.getBoundingClientRect();
  caretEl.hidden = false;
  caretEl.style.left = `${rect.left - w.left}px`;
  caretEl.style.top = `${rect.top - w.top}px`;
  caretEl.style.height = `${rect.height}px`;
  caretEl.style.animation = "none";
  void caretEl.offsetWidth;
  caretEl.style.animation = "";
}

function scrollToFocus() {
  const s = sel();
  if (!s.focusNode) return;
  const rect = rectOf(s.focusNode, s.focusOffset);
  if (!rect) return;
  const top = 90;
  const bottom = window.innerHeight - 110;
  if (rect.top < top) window.scrollBy(0, rect.top - top - 40);
  else if (rect.bottom > bottom) window.scrollBy(0, rect.bottom - bottom + 40);
}

type Mod = "move" | "extend";
function modify(alter: Mod, dir: "forward" | "backward", gran: string, times = 1) {
  const s = sel();
  if (!s.rangeCount || !inDoc(s.focusNode)) restoreSelection();
  const before = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  for (let i = 0; i < times; i++) (s as unknown as { modify(a: string, d: string, g: string): void }).modify(alter, dir, gran);
  if (!inDoc(s.focusNode)) {
    // walked out of the document: stay where we were
    if (before) {
      s.removeAllRanges();
      s.addRange(before);
    }
  }
  updateCaret();
  scrollToFocus();
}

const BLOCK = "p, h1, h2, h3, h4, h5, h6, pre, li, td, th";
function blockRange(): Range | null {
  const s = sel();
  if (!s.focusNode || !inDoc(s.focusNode)) return null;
  const el = elOf(s.focusNode).closest(BLOCK);
  if (!el || !doc.contains(el)) return null;
  const r = document.createRange();
  r.selectNodeContents(el);
  const nested = el.tagName === "LI" ? el.querySelector(":scope > ul, :scope > ol") : null;
  if (nested) r.setEndBefore(nested);
  return r;
}

/** Selection to annotate: the real selection, or the block under the caret. */
function targetRange(): Range | null {
  const s = sel();
  if (s.rangeCount && !s.isCollapsed && inDoc(s.anchorNode) && inDoc(s.focusNode)) return s.getRangeAt(0).cloneRange();
  return blockRange();
}

function selectRange(r: Range) {
  const s = sel();
  s.removeAllRanges();
  s.addRange(r);
  updateCaret();
  scrollToFocus();
}

// ---------- locating the source line ----------
const norm = (s: string) => s.replace(/[*_`#>|\\[\]()~-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function lineIn(block: HTMLElement | null, needle: string, last: boolean): number | null {
  if (!block) return null;
  const b = blocks[Number(block.dataset.i)];
  if (!b) return null;
  const rawLines = b.raw.split("\n");
  const n = norm(needle);
  if (!n) return b.line + (last ? rawLines.length - 1 : 0);
  const probe = last ? n.slice(-30) : n.slice(0, 30);
  let hit = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (norm(rawLines[i]!).includes(probe)) {
      hit = i;
      if (!last) break;
    }
  }
  if (hit >= 0) return b.line + hit;
  return b.line + (last ? rawLines.length - 1 : 0);
}

const blockEl = (n: Node) => elOf(n).closest<HTMLElement>(".blk");

function locate(range: Range, quote: string): [number | null, number | null] {
  const qLines = quote.split("\n").filter((l) => l.trim());
  const start = lineIn(blockEl(range.startContainer), qLines[0] ?? "", false);
  let end = lineIn(blockEl(range.endContainer), qLines[qLines.length - 1] ?? "", true);
  if (start != null && (end == null || end < start)) end = start;
  return [start, end];
}

// ---------- highlighting ----------
function wrap(range: Range, a: Annotation) {
  const root = range.commonAncestorContainer;
  const texts: Text[] = [];
  if (root.nodeType === 3) texts.push(root as Text);
  else {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) if (range.intersectsNode(n)) texts.push(n as Text);
  }
  for (const t of texts) {
    const s = t === range.startContainer ? range.startOffset : 0;
    const e = t === range.endContainer ? range.endOffset : t.length;
    if (e <= s || !t.data.slice(s, e).trim()) continue;
    if (e < t.length) t.splitText(e);
    const target = s > 0 ? t.splitText(s) : t;
    const m = document.createElement("mark");
    m.dataset.ann = String(a.id);
    m.className = `k-${a.kind}${a.label ? ` c-${a.label.color}` : ""}`;
    target.replaceWith(m);
    m.append(target);
  }
}

const marksOf = (id: number) => [...doc.querySelectorAll<HTMLElement>(`mark[data-ann="${id}"]`)];

function unwrap(id: number) {
  for (const m of marksOf(id)) {
    const p = m.parentNode!;
    m.replaceWith(...m.childNodes);
    p.normalize();
  }
}

// ---------- annotations ----------
function ordered(): Annotation[] {
  const pos = (a: Annotation) => marksOf(a.id)[0] ?? null;
  return [...anns].sort((x, y) => {
    const px = pos(x);
    const py = pos(y);
    if (!px || !py) return px ? -1 : py ? 1 : x.id - y.id;
    if (px === py) return x.id - y.id;
    return px.compareDocumentPosition(py) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

function activeId(): number | null {
  if (navId != null && anns.some((a) => a.id === navId)) return navId;
  const s = sel();
  if (!s.focusNode || !inDoc(s.focusNode)) return null;
  const m = elOf(s.focusNode).closest<HTMLElement>("mark[data-ann]");
  return m ? Number(m.dataset.ann) : null;
}

function addAnnotation(range: Range, partial: Pick<Annotation, "kind" | "text" | "label">) {
  const s = sel();
  s.removeAllRanges();
  s.addRange(range);
  const quote = s.toString().replace(/\n{3,}/g, "\n\n").trim();
  if (!quote) return toast("Nothing to annotate here");
  const [lineStart, lineEnd] = locate(range, quote);
  const a: Annotation = { id: ++seq, quote, lineStart, lineEnd, ...partial };
  wrap(range, a);
  anns.push(a);
  const ms = marksOf(a.id);
  const lastMark = ms[ms.length - 1];
  const t = lastMark?.lastChild;
  navId = null;
  if (t && t.nodeType === 3) s.collapse(t, (t as Text).length);
  updateCaret();
  refresh();
  toast(`${describe(a)} added · u to undo`);
}

function removeAnnotation(id: number) {
  const i = anns.findIndex((a) => a.id === id);
  if (i < 0) return;
  const last = marksOf(id).pop();
  unwrap(id);
  anns.splice(i, 1);
  navId = null;
  if (last?.isConnected) {
    /* unreachable: unwrap removes it */
  }
  updateCaret();
  refresh();
}

const describe = (a: Annotation) => (a.kind === "label" ? `${a.label!.emoji} ${a.label!.text}` : a.kind === "delete" ? "✂ Remove" : a.kind === "global" ? "General comment" : "💬 Comment");

function refresh() {
  $("count").textContent = `${anns.length} annotation${anns.length === 1 ? "" : "s"}`;
  const act = activeId();
  for (const m of doc.querySelectorAll("mark.cur")) m.classList.remove("cur");
  if (act != null && navId != null) for (const m of marksOf(act)) m.classList.add("cur");
  const list = $("list");
  list.textContent = "";
  const items = ordered();
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing yet. Select text (shift+arrows, or v for the paragraph) and press c, d or 1-0.";
    list.append(li);
  }
  for (const a of items) {
    const li = document.createElement("li");
    if (a.id === act) li.className = "active";
    if (a.id === navId) li.classList.add("sel");
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${describe(a)}${a.lineStart != null ? ` · L${a.lineStart}${a.lineEnd && a.lineEnd !== a.lineStart ? `–${a.lineEnd}` : ""}` : ""}`;
    const acts = document.createElement("span");
    acts.className = "acts";
    if (a.kind === "comment" || a.kind === "global") {
      const eb = Object.assign(document.createElement("button"), { textContent: "✎ e", title: "Edit" });
      eb.addEventListener("click", (ev) => (ev.stopPropagation(), editAnnotation(a)));
      acts.append(eb);
    }
    const xb = Object.assign(document.createElement("button"), { textContent: "✕ x", title: "Delete" });
    xb.addEventListener("click", (ev) => (ev.stopPropagation(), removeAnnotation(a.id)));
    acts.append(xb);
    meta.prepend(acts);
    li.append(meta);
    if (a.quote) {
      const q = document.createElement("div");
      q.className = "q";
      q.textContent = a.quote;
      li.append(q);
    }
    if (a.text) {
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = a.text;
      li.append(t);
    }
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => jumpTo(a.id));
    li.addEventListener("dblclick", () => editAnnotation(a));
    list.append(li);
    if (a.id === navId) li.scrollIntoView({ block: "nearest" });
  }
  renderBar();
}

function jumpTo(id: number) {
  const ms = marksOf(id);
  if (!ms.length) {
    // general comment: nothing in the text to select, just pick the card
    navId = id;
    refresh();
    return;
  }
  const r = document.createRange();
  r.setStartBefore(ms[0]!);
  r.setEndAfter(ms[ms.length - 1]!);
  selectRange(r);
  navId = id;
  refresh();
}

function navigate(dir: 1 | -1) {
  const items = ordered();
  if (!items.length) return toast("No annotations yet");
  const cur = activeId();
  let i = items.findIndex((a) => a.id === cur);
  i = i < 0 ? (dir === 1 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
  jumpTo(items[i]!.id);
}

// ---------- composer ----------
interface ComposerOpts {
  quote: string;
  initial?: string;
  anchor?: Range | null;
  canRemove?: boolean;
  onSave: (text: string) => void;
  onRemove?: () => void;
}
let composerOpts: ComposerOpts | null = null;
const composerOpen = () => !composer.hidden;

function openComposer(o: ComposerOpts) {
  composerOpts = o;
  $("c-quote").textContent = o.quote;
  $("c-quote").hidden = !o.quote;
  $("c-del").hidden = !o.canRemove;
  cText.value = o.initial ?? "";
  composer.hidden = false;
  // keep the selection visible while the textarea has focus
  if (o.anchor && "highlights" in CSS) (CSS as unknown as { highlights: Map<string, unknown> }).highlights.set("pending", new (window as unknown as { Highlight: new (r: Range) => unknown }).Highlight(o.anchor));
  const rect = o.anchor?.getBoundingClientRect();
  const h = composer.offsetHeight;
  let top = rect && rect.height ? rect.bottom + 10 : window.innerHeight / 3;
  if (top + h > window.innerHeight - 60) top = Math.max(60, (rect?.top ?? window.innerHeight) - h - 10);
  composer.style.top = `${top}px`;
  composer.style.left = `${Math.min(Math.max(12, rect?.left ?? 200), window.innerWidth - composer.offsetWidth - 12)}px`;
  cText.focus();
}

function closeComposer() {
  cText.blur(); // a hidden focused textarea would keep swallowing keys
  composer.hidden = true;
  composerOpts = null;
  if ("highlights" in CSS) (CSS as unknown as { highlights: Map<string, unknown> }).highlights.delete("pending");
  restoreSelection();
  updateCaret();
}

cText.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  e.stopPropagation();
  if (!composerOpts) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const text = cText.value.trim();
    if (!text) return;
    const o = composerOpts!;
    closeComposer();
    o.onSave(text);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeComposer();
  } else if (e.key === "Backspace" && (e.metaKey || e.ctrlKey) && composerOpts?.canRemove) {
    e.preventDefault();
    const o = composerOpts;
    closeComposer();
    o.onRemove?.();
  }
});

function commentOnSelection() {
  const r = targetRange();
  if (!r) return toast("Put the cursor in the text first");
  const s = sel();
  s.removeAllRanges();
  s.addRange(r);
  const quote = s.toString().trim();
  openComposer({ quote, anchor: r, onSave: (text) => addAnnotation(r, { kind: "comment", text }) });
}

function globalComment() {
  openComposer({ quote: "", onSave: (text) => {
    anns.push({ id: ++seq, kind: "global", quote: "", lineStart: null, lineEnd: null, text });
    refresh();
    toast("General comment added");
  } });
}

function editAnnotation(a: Annotation) {
  if (a.kind !== "comment" && a.kind !== "global") return toast("Only comments can be edited; x removes");
  openComposer({
    quote: a.quote,
    initial: a.text,
    canRemove: true,
    anchor: null,
    onSave: (text) => {
      a.text = text;
      refresh();
    },
    onRemove: () => removeAnnotation(a.id),
  });
}

function quick(kind: "delete" | "label", label?: QuickLabel) {
  const r = targetRange();
  if (!r) return toast("Put the cursor in the text first");
  addAnnotation(r, { kind, label });
}

function undo() {
  const last = anns.reduce<Annotation | null>((m, a) => (!m || a.id > m.id ? a : m), null);
  if (!last) return;
  removeAnnotation(last.id);
  toast("Undone");
}

// ---------- modal / toast / bar ----------
function showModal(html: string) {
  $("m-body").innerHTML = html;
  $("modal").hidden = false;
  modalOpen = true;
}
function closeModal() {
  $("modal").hidden = true;
  modalOpen = false;
  pendingConfirm = null;
}
let pendingConfirm: (() => void) | null = null;
function confirm(html: string, ok: () => void) {
  showModal(`${html}<p><kbd>Enter</kbd> confirm · <kbd>Esc</kbd> cancel</p>`);
  pendingConfirm = ok;
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2200);
}

function renderBar() {
  const bar = $("bar");
  bar.textContent = "";
  const chip = (key: string, text: string, run: () => void) => {
    const b = document.createElement("button");
    b.innerHTML = `<kbd>${key}</kbd> ${esc(text)}`;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", run);
    bar.append(b);
  };
  const sep = () => bar.append(Object.assign(document.createElement("span"), { className: "sep" }));
  chip("c", "Comment", commentOnSelection);
  chip("d", "Remove", () => quick("delete"));
  chip("g", "General", globalComment);
  sep();
  labels.forEach((l, i) => chip(String((i + 1) % 10), `${l.emoji} ${l.text}`, () => quick("label", l)));
  sep();
  chip("v", "Select block", () => {
    const r = blockRange();
    if (r) selectRange(r);
  });
  chip("[ ]", "Prev/next", () => navigate(1));
  chip("e", "Edit", () => {
    const a = anns.find((x) => x.id === activeId());
    if (a) editAnnotation(a);
  });
  chip("x", "Delete mark", () => {
    const id = activeId();
    if (id != null) removeAnnotation(id);
  });
  chip("u", "Undo", undo);
}

const HELP = `<h2>Keyboard</h2>
<p class="muted">Works with any keyboard layout (keys are matched by position).</p>
<table>
<tr><td><kbd>← → ↑ ↓</kbd></td><td>move the cursor; with <kbd>Shift</kbd> extend the selection</td></tr>
<tr><td><kbd>${isMac ? "⌥" : "Ctrl"} + ← →</kbd></td><td>by word (<kbd>${isMac ? "⌥" : "Ctrl"} + ↑ ↓</kbd> by paragraph)</td></tr>
<tr><td><kbd>${isMac ? "⌘" : "Home/End"} ← →</kbd></td><td>start / end of line (<kbd>${isMac ? "⌘ ↑ ↓" : "Ctrl+Home/End"}</kbd> of document)</td></tr>
<tr><td><kbd>PgUp PgDn</kbd></td><td>page</td></tr>
<tr><td><kbd>v</kbd></td><td>select the block (paragraph, item, heading) under the cursor</td></tr>
<tr><td><kbd>c</kbd> / <kbd>Enter</kbd></td><td>comment on the selection (no selection = the block under the cursor)</td></tr>
<tr><td><kbd>d</kbd></td><td>mark the selection for removal</td></tr>
<tr><td><kbd>1</kbd>…<kbd>0</kbd></td><td>quick labels, listed in the bottom bar</td></tr>
<tr><td><kbd>g</kbd></td><td>general comment about the whole document</td></tr>
<tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>previous / next annotation</td></tr>
<tr><td><kbd>e</kbd> / <kbd>x</kbd></td><td>edit / delete the annotation under the cursor</td></tr>
<tr><td><kbd>u</kbd></td><td>undo the last annotation</td></tr>
<tr><td><kbd>{</kbd> <kbd>}</kbd></td><td>previous / next heading (outline on the left is clickable too)</td></tr>
<tr><td><kbd>b</kbd> / <kbd>o</kbd></td><td>toggle annotations panel / outline</td></tr>
<tr><td>click a card</td><td>select it (then <kbd>e</kbd> edit, <kbd>x</kbd> delete); double-click edits</td></tr>
<tr><td><kbd>Esc</kbd></td><td>collapse the selection</td></tr>
<tr><td><kbd>${isMac ? "⌘" : "Ctrl"}+Enter</kbd></td><td>finish: print annotations to stdout</td></tr>
<tr><td><kbd>Shift+Q</kbd></td><td>discard everything (exit code 1)</td></tr>
</table>
<p>In the comment box: <kbd>Enter</kbd> saves, <kbd>Shift+Enter</kbd> adds a line, <kbd>Esc</kbd> cancels. Mouse selection works too.</p>
<p><kbd>Esc</kbd> to close</p>`;

// ---------- finish ----------
function finish() {
  const n = anns.length;
  confirm(
    n ? `<h2>Send ${n} annotation${n === 1 ? "" : "s"}?</h2>` : "<h2>No annotations — finish as is?</h2><p>The CLI will print nothing and exit 0.</p>",
    async () => {
      finished = true;
      await api("/api/finish", { annotations: ordered() });
      document.body.innerHTML = "<p style='padding:40px;font:16px sans-serif'>Done — feedback sent to the terminal. You can close this tab.</p>";
      window.close();
    },
  );
}
function discard() {
  confirm("<h2>Discard all annotations?</h2><p>The CLI exits with code 1.</p>", async () => {
    finished = true;
    await api("/api/discard", {});
    document.body.innerHTML = "<p style='padding:40px;font:16px sans-serif'>Discarded. You can close this tab.</p>";
    window.close();
  });
}

// ---------- keyboard ----------
const DIGITS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9 };

document.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (modalOpen) {
    if (e.code === "Escape") closeModal();
    else if (e.code === "Enter" && pendingConfirm) {
      const run = pendingConfirm;
      closeModal();
      run();
    }
    e.preventDefault();
    return;
  }
  if (composerOpen()) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && e.code === "Enter") return e.preventDefault(), finish();
  if (mod && e.code === "KeyZ" && !e.shiftKey) return e.preventDefault(), undo();

  const arrow = ({ ArrowLeft: ["backward", "l"], ArrowRight: ["forward", "r"], ArrowUp: ["backward", "u"], ArrowDown: ["forward", "d"] } as const)[e.code as "ArrowLeft"];
  if (arrow && !(e.ctrlKey && isMac)) {
    e.preventDefault();
    navId = null;
    const [dir, axis] = arrow;
    const word = e.altKey || (!isMac && e.ctrlKey);
    const boundary = isMac && e.metaKey;
    const alter: Mod = e.shiftKey ? "extend" : "move";
    let gran = axis === "l" || axis === "r" ? "character" : "line";
    if (word) gran = axis === "l" || axis === "r" ? "word" : "paragraph";
    if (boundary) gran = axis === "l" || axis === "r" ? "lineboundary" : "documentboundary";
    modify(alter, dir, gran);
    refresh();
    return;
  }
  if (e.code === "Home" || e.code === "End") {
    e.preventDefault();
    modify(e.shiftKey ? "extend" : "move", e.code === "Home" ? "backward" : "forward", e.ctrlKey ? "documentboundary" : "lineboundary");
    return;
  }
  if (e.code === "PageDown" || e.code === "PageUp") {
    e.preventDefault();
    modify(e.shiftKey ? "extend" : "move", e.code === "PageDown" ? "forward" : "backward", "line", 15);
    return;
  }
  if (mod || e.altKey) return; // leave browser shortcuts (copy, reload…) alone

  if (e.code === "Escape") {
    const s = sel();
    navId = null;
    if (s.rangeCount && !s.isCollapsed) s.collapse(s.focusNode, s.focusOffset);
    updateCaret();
    refresh();
    return;
  }
  if (e.code === "Slash" && e.shiftKey) return e.preventDefault(), showModal(HELP);
  if (e.code === "KeyQ" && e.shiftKey) return e.preventDefault(), discard();
  if (e.shiftKey && (e.code === "BracketRight" || e.code === "BracketLeft")) return e.preventDefault(), headingStep(e.code === "BracketRight" ? 1 : -1);
  if (e.shiftKey) return;

  const handled = (fn: () => void) => (e.preventDefault(), fn());
  if (e.code === "KeyC" || e.code === "Enter") return handled(commentOnSelection);
  if (e.code === "KeyD") return handled(() => quick("delete"));
  if (e.code === "KeyG") return handled(globalComment);
  if (e.code === "KeyV") return handled(() => {
    const r = blockRange();
    if (r) selectRange(r);
  });
  if (e.code === "KeyU") return handled(undo);
  if (e.code === "KeyO") return handled(() => document.body.classList.toggle("noout"));
  if (e.code === "KeyB") return handled(() => document.body.classList.toggle("noside"));
  if (e.code === "BracketRight") return handled(() => navigate(1));
  if (e.code === "BracketLeft") return handled(() => navigate(-1));
  if (e.code === "KeyX") return handled(() => {
    const id = activeId();
    if (id != null) removeAnnotation(id);
  });
  if (e.code === "KeyE") return handled(() => {
    const a = anns.find((x) => x.id === activeId());
    if (a) editAnnotation(a);
  });
  if (e.code in DIGITS) {
    const l = labels[DIGITS[e.code]!];
    if (l) handled(() => quick("label", l));
  }
});

document.addEventListener("selectionchange", () => {
  if (composerOpen()) return;
  updateCaret();
});
doc.addEventListener("mouseup", () => {
  navId = null;
  setTimeout(refresh);
});
doc.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  if (a) {
    e.preventDefault(); // a click must never navigate away from the session
    if (/^https?:/.test(a.href)) window.open(a.href, "_blank", "noopener");
  }
});
window.addEventListener("resize", updateCaret);
window.addEventListener("beforeunload", (e) => {
  if (!finished && anns.length) e.preventDefault();
});
$("btn-finish").addEventListener("click", finish);
$("btn-discard").addEventListener("click", discard);
$("btn-help").addEventListener("click", () => showModal(HELP));
$("modal").addEventListener("mousedown", (e) => {
  if (e.target === $("modal")) closeModal();
});

// ---------- boot ----------
const data = (await api("/api/doc")) as { name: string; content: string; labels: QuickLabel[] };
fileName = data.name;
labels = data.labels;
$("file").textContent = fileName;
document.title = `annotator — ${fileName}`;
render(data.content);
buildOutline();
const t0 = firstText();
if (t0) sel().collapse(t0, 0);
updateCaret();
refresh();
