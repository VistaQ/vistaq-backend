#!/usr/bin/env bash
# Stop check: on a turn that wrote a file, allow the stop only when the working tree still matches the
# fingerprint verify-stamp.sh recorded after a passing `npm run verify`. It runs no project code: hooks run
# outside Claude Code's sandbox, so running `npm run verify` here would let code planted from inside the
# sandbox run unsandboxed. It catches a forgotten verify, not a deliberate bypass of it.
# Called by stop-gate.sh, which owns the write flag; this script only reads it.
INPUT=$(cat)

FLAG="$CLAUDE_PROJECT_DIR/.claude/.write-flag"
[ -f "$FLAG" ] || exit 0

# Only the main checkout's .git (config, hooks) is out of the sandbox's reach; a worktree's `.git` file is not.
COMMON="$CLAUDE_PROJECT_DIR/.git"
if [ ! -d "$COMMON" ]; then
  printf '{"systemMessage":"⚠️ verify not enforced outside a main checkout — run npm run verify by hand"}\n'
  exit 0
fi

VERIFY_STAMP_LIB=1 . "$CLAUDE_PROJECT_DIR/.claude/hooks/verify-stamp.sh"

# Check the registered worktree the session is working in, not always the main checkout.
CWD=$(cd "$(printf '%s' "$INPUT" | jq -r '.cwd // empty')" 2>/dev/null && pwd -P)
TOP="$CLAUDE_PROJECT_DIR"
while IFS= read -r WT; do
  WT=$(cd "$WT" 2>/dev/null && pwd -P) || continue
  case "$CWD/" in "$WT"/*) [ ${#WT} -gt ${#TOP} ] && TOP="$WT" ;; esac
done < <(git --git-dir="$COMMON" -c core.fsmonitor=false worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')

FINGERPRINT=$(verify_fingerprint "$COMMON" "$TOP")
if [ -n "$FINGERPRINT" ] && [ "$(cat "$TOP/.claude/.verify-stamp" 2>/dev/null)" = "$FINGERPRINT" ]; then
  exit 0
fi

# Already blocked once — warn the user instead of looping forever.
if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  printf '{"systemMessage":"⚠️ files changed since the last passing npm run verify, still unverified after a retry — verify manually"}\n'
  exit 0
fi

jq -n --arg top "$TOP" '{
  decision: "block",
  reason: "Files changed since the last passing verify in \($top): run `npm run verify && sh .claude/hooks/verify-stamp.sh` there, fix any failures, then finish."
}'
exit 0
