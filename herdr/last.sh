#!/usr/bin/env bash
# Herdr action: review the focused agent's last message in annotator, send the feedback back.
set -uo pipefail

herdr="${HERDR_BIN_PATH:-herdr}"
root="$(cd "$(dirname "$0")/.." && pwd)"
bun="$root/node_modules/.bin/bun"

fail() { "$herdr" notification show "Annotator" --body "$1" >/dev/null 2>&1; echo "annotator: $1" >&2; exit 1; }

pane="${HERDR_PANE_ID:-}"
[ -n "$pane" ] || fail "no focused pane"
[ -x "$bun" ] || fail "bun not found at $bun (run npm install in $root)"

info="$("$herdr" pane get "$pane" | jq '.result.pane')"
agent="$(jq -r '.agent // empty' <<<"$info")"
sid="$(jq -r '.agent_session.value // empty' <<<"$info")"
cwd="$(jq -r '.foreground_cwd // .cwd // empty' <<<"$info")"
[ -n "$agent" ] || fail "no agent in pane $pane"

dir="${HERDR_PLUGIN_STATE_DIR:-${TMPDIR:-/tmp}}"
mkdir -p "$dir"
msg="$dir/agent-last-message.md"
"$bun" "$root/src/last-message.ts" "$agent" --session "$sid" --cwd "$cwd" >"$msg" 2>"$dir/last.err" \
  || fail "cannot read last message: $(head -c 300 "$dir/last.err")"
[ -s "$msg" ] || fail "last message is empty"

# Blocks until Finish/Discard in the browser; stdout is the feedback.
out="$("$bun" "$root/src/cli.ts" "$msg")"
code=$?
case $code in
  0) [ -n "$out" ] || { "$herdr" notification show "Annotator" --body "No annotations, nothing sent" >/dev/null 2>&1; exit 0; }
     "$herdr" agent prompt "$pane" "$out" || fail "could not send feedback to $pane" ;;
  1) exit 0 ;;
  *) fail "annotator exited with code $code" ;;
esac
