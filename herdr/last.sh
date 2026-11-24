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

session="$("$herdr" pane get "$pane" | jq -r '.result.pane.agent_session // empty')"
agent="$(jq -r '.agent // empty' <<<"$session")"
sid="$(jq -r '.value // empty' <<<"$session")"
[ -n "$agent" ] && [ -n "$sid" ] || fail "pane $pane has no agent session"

dir="${HERDR_PLUGIN_STATE_DIR:-${TMPDIR:-/tmp}}"
mkdir -p "$dir"
msg="$dir/agent-last-message.md"
"$bun" "$root/src/last-message.ts" "$agent" "$sid" >"$msg" 2>"$dir/last.err" \
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
