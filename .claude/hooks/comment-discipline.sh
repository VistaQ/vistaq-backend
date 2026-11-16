#!/usr/bin/env bash
# Stop check: the one rule of .claude/rules/comments.md that is decidable by regex, a multi-line
# comment added to code that did not change, which needs `git diff HEAD`.
# Called by stop-gate.sh, which owns the write flag; this script only reads it.
#
# Only patterns that are decidable by regex live here. "Why, not what", stale-comment
# updates and JSDoc-that-restates-the-signature stay a judgement call — a hook that
# guesses at those produces false positives, which trains the agent to ignore it.
#
# `as unknown as` is not flagged here: eslint's no-restricted-syntax already bans it.
INPUT=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0

FLAG="$CLAUDE_PROJECT_DIR/.claude/.write-flag"
[ -f "$FLAG" ] || exit 0

# One retry max, same contract as lint-check-types.sh.
if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

# Added lines across tracked edits + whole content of new untracked files.
DIFF=$(
  git diff HEAD --unified=0 -- 'src/*.ts' 'scripts/*.ts' 'tests/*.ts' 2>/dev/null
  git ls-files --others --exclude-standard -- 'src/*.ts' 'scripts/*.ts' 'tests/*.ts' 2>/dev/null |
    while IFS= read -r f; do git diff --no-index --unified=0 /dev/null "$f" 2>/dev/null; done
)
[ -n "$DIFF" ] || exit 0

VIOLATIONS=$(printf '%s\n' "$DIFF" | awk '
  # `orphan` = the run was not followed by an added code line, i.e. a comment bolted onto code that
  # did not change; `hunkdel` = the hunk also removed a comment line, so the run REWROTE a comment.
  function in_openapi(f, n,   l, i, inblock, api) {
    while (++i < n && (getline l < f) > 0) {
      if (l ~ /^[[:space:]]*\/\*\*/) { inblock = 1; api = 0 }
      if (inblock && l ~ /@openapi/) api = 1
      if (l ~ /\*\//) { inblock = 0; api = 0 }
    }
    close(f)
    return inblock && api
  }
  function flush(orphan,   n) {
    n = runlen
    runlen = 0
    if (n > 0 && !runskip && runstar && in_openapi(runfile, runline)) runskip = 1
    if (n == 0 || runskip) { runskip = 0; return }
    if (orphan && !hunkdel && n >= 2)
      print runfile ":" runline ": " n "-line comment added to code that did not change — if the code already says it, drop it"
  }
  /^\+\+\+ / { flush(1); hunkdel = 0; file = substr($0, 7); next }
  /^--- / { next }
  /^@@ / { flush(1); hunkdel = 0; split($3, h, ","); line = substr(h[1], 2) + 0; next }
  /^-/ { if (substr($0, 2) ~ /^[[:space:]]*(\/\/|\/\*|\*)/) hunkdel = 1; next }
  /^\+/ {
    body = substr($0, 2)
    if (body ~ /^[[:space:]]*(\/\/|\/\*|\*)/) {
      if (runlen == 0) { runfile = file; runline = line; runstar = (body ~ /^[[:space:]]*\*/) }
      runlen++
      # An `@openapi` block is a YAML document, not prose — matched by the tag, a ` * key:` line or a
      # ` * - ` list item; a prose-only mid-block edit has neither, so flush() checks the enclosing
      # `/**` block in the working file (in_openapi).
      if (body ~ /@openapi/ || body ~ /^[[:space:]]*\*[[:space:]]+(-[[:space:]]|[A-Za-z0-9_$-]+:)/) runskip = 1
    } else {
      flush(0)
    }
    line++
    next
  }
  /^[^-]/ { line++ }
  END { flush(1) }
')

[ -n "$VIOLATIONS" ] || exit 0

{
  echo "Comment discipline (.claude/rules/comments.md) — fix these added lines:"
  printf '%s\n' "$VIOLATIONS"
  echo "Then re-check the same diff for the judgement-call rules: no what-narration, no signature-restating JSDoc, no trailing field comments, no tombstones, and update any comment your change invalidated."
} >&2
exit 2
