# annotator

Review a markdown file (agent answer, report) in the browser and get your
annotations back as markdown on stdout. Does one thing: file in, feedback out.

    annotator report.md > feedback.md      # or: annotator report.md | pbcopy

- `--no-open` don't launch the browser (URL is printed to stderr), `--port N`.
- Exit codes: 0 finished (empty stdout = no annotations), 1 discarded, 2 usage/error.
- stdout carries only the feedback; status goes to stderr.

## Run

    npm install            # bun comes as a local dev dependency
    npx bun src/cli.ts report.md
    npx bun test

For a global command: `npx bun link` in this folder (needs bun on PATH).

## Keyboard (press ? in the page)

Editor-like cursor: arrows move, Shift+arrows select, Alt+arrows by word,
Cmd+arrows to line/document boundary. Keys match by position, so they work in any layout.

| key | action |
| --- | --- |
| `c` / Enter | comment on selection (no selection = block under cursor); Enter saves, Shift+Enter newline |
| `d` | mark for removal |
| `1`…`0` | quick labels (plannotator's preset set, shown in the bottom bar) |
| `g` | general comment |
| `v` | select block under cursor |
| `[` `]` | previous / next annotation; `e` edit, `x` delete, `u` undo |
| `{` `}` / `o` | previous / next heading; toggle outline (left panel, clickable) |
| click a card | select it, then `e` edit / `x` delete (or the buttons on the card); `b` toggles the panel |
| Cmd/Ctrl+Enter | finish; Shift+Q discard |

## Design notes

- Blocking: server lives only for the session; random port on 127.0.0.1, URL carries a session token.
- Anchor = quoted text + source line(s) (located heuristically in the markdown source).
- Raw HTML inside the markdown is escaped, not rendered.
- Not in MVP: stdin/multiple files, persistence of unfinished sessions (closing the tab asks for confirmation; the CLI keeps waiting), custom labels.
