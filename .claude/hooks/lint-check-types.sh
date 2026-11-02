#!/usr/bin/env bash
# Stop hook: enforce `pnpm verify` (the tool-neutral gate in package.json)
# only on turns that wrote a file.
# Fail → exit 2 blocks the stop and feeds errors back to Claude (one retry max via stop_hook_active).
INPUT=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0

# Fire ONLY on turns that wrote a file this turn. The PostToolUse hook in .claude/settings.json
# (inline jq on Write|Edit|MultiEdit) drops this flag; absent flag → Q&A turn → skip.
FLAG="$CLAUDE_PROJECT_DIR/.claude/.write-flag"
[ -f "$FLAG" ] || exit 0

OUTPUT=$(npm run type-check 2>&1) && { rm -f "$FLAG"; exit 0; }

# Already retried once — warn the user instead of looping forever; clear flag to give up.
if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  rm -f "$FLAG"
  printf '{"systemMessage":"⚠️ pnpm verify still failing after retry — fix manually"}\n'
  exit 0
fi

# First failure — keep the flag so the retry turn re-verifies even if it does not re-edit.

printf '%s\n' "$OUTPUT" | tail -50 >&2
exit 2
