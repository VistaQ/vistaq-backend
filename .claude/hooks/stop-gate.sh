#!/usr/bin/env bash
# Stop hook: runs the comment-discipline and verify-stamp checks in sequence, then clears the write flag once.
# One entry instead of two because parallel Stop hooks that share the flag race: whichever finishes first
# deletes it and the other skips.
#   exit 2 + stderr          -> comment-discipline found violations, Claude must fix them
#   stdout JSON (block|warn) -> verify-stamp forwarded as is
# The flag survives a block so the retry turn re-checks; a warning or a pass clears it.
INPUT=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0

FLAG="$CLAUDE_PROJECT_DIR/.claude/.write-flag"
[ -f "$FLAG" ] || exit 0

HOOKS="$CLAUDE_PROJECT_DIR/.claude/hooks"
WARNING=""

for CHECK in comment-discipline lint-check-types; do
  STDERR=$(mktemp "${TMPDIR:-/tmp}/stop-gate.XXXXXX") || exit 0
  STDOUT=$(printf '%s' "$INPUT" | bash "$HOOKS/$CHECK.sh" 2>"$STDERR")
  RC=$?
  if [ "$RC" -eq 2 ]; then
    cat "$STDERR" >&2
    echo "Then run \`npm run verify && sh .claude/hooks/verify-stamp.sh\`; this block uses up the retry the verify check would otherwise get." >&2
    rm -f "$STDERR"
    exit 2
  fi
  rm -f "$STDERR"
  if [ -n "$STDOUT" ]; then
    if [ "$(printf '%s' "$STDOUT" | jq -r '.decision // empty' 2>/dev/null)" = "block" ]; then
      printf '%s\n' "$STDOUT"
      exit 0
    fi
    WARNING="$STDOUT"
  fi
done

rm -f "$FLAG"
[ -n "$WARNING" ] && printf '%s\n' "$WARNING"
exit 0
