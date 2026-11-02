# Comments

**Write why, not what. If the code is clear, write nothing.** Zero comments is the expected outcome for most files. Do not open a diff looking for somewhere to add one.

A comment earns its place only if you can name, in one clause, a fact a competent reader could not recover from the code, the types and the call sites. "It's complex" and "future readers might wonder" are not facts.

## Delete on sight

* JSDoc that restates the signature (`/** User service */` on `UserService`).
* "What" narration on obvious lines (`// build the params`) and step numbers (`// 1. validate`).
* Trailing comments that restate a field. Names and types carry the meaning.
* Banner sandwiches (`// ===== ROUTES =====`) around things already labelled. A file with three or more banner-labelled sections is fine.
* Process metadata: ticket ids, revision history, "will change in the next phase".
* Hardcoded counts and inventories ("all four repositories…") that rot on the next change.
* Tombstones (`// moved to X`, `/** no longer does Y */`). Git history records removals. Describe what the code is, not what it used to be.

## Keep

This list is exhaustive. A comment that fits none of these goes, however well written.

* A fact that lives outside this repo: a vendor quirk, an undocumented API behaviour, a business or regulatory rule, a cost or retry constraint.
* A deliberate deviation: the obvious approach is wrong here and someone will "fix" it back. Say what breaks if they do.
* A TODO with a concrete trigger: what unblocks it, not that it exists.
* `@openapi` blocks, and `@param` / `@throws` lines that add information beyond the types.

Anything you could fix by renaming is a naming bug, not a comment.

## Shape

* One line is the target, three is the ceiling, and each line fits `printWidth` from `.prettierrc.json` (prettier never rewraps a comment).
* Say it once per file, at first use.
* External references use `@see <URL>`.

## When editing

* Delete stale or obvious comments on lines you are already touching. Do not sweep unrelated files.
* Update any comment your change invalidated, even a few lines away. A comment that contradicts its code is a bug.
* Never modify a line solely to add a comment.

## Enforcement

* ESLint does not check comments. These rules are followed by judgement, with one backstop: the Stop hook (`.claude/hooks/comment-discipline.sh`) flags a multi-line comment added to code that did not change.
