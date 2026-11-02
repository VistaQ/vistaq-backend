#!/bin/sh
# Records that `npm run verify` passed for the current tree: `npm run verify && sh .claude/hooks/verify-stamp.sh`.
# The Stop hook (lint-check-types.sh) sources this file for verify_fingerprint() and compares the stamp
# with a fresh fingerprint, so it never has to run project code outside the sandbox.

# A throwaway index and object store keep .git untouched; fsmonitor and hooksPath are forced off because
# the Stop hook calls this unsandboxed.
_vf_git() {
	_vf_common=$1
	_vf_top=$2
	shift 2
	GIT_INDEX_FILE="$_vf_tmp/index" GIT_OBJECT_DIRECTORY="$_vf_tmp/objects" GIT_ALTERNATE_OBJECT_DIRECTORIES="$_vf_common/objects" \
		git -C "$_vf_top" --git-dir="$_vf_common" --work-tree="$_vf_top" -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"
}

# Tree hash of the working tree: untracked files included, .gitignore respected. $1 = git common dir, $2 = work tree.
verify_fingerprint() {
	_vf_tmp=$(mktemp -d "${TMPDIR:-/tmp}/verify-fp.XXXXXX") || return 1
	mkdir "$_vf_tmp/objects"
	if _vf_git "$1" "$2" add -A >/dev/null 2>&1 &&
		_vf_git "$1" "$2" rm -q --cached --ignore-unmatch -- .claude/.verify-stamp .claude/.write-flag >/dev/null 2>&1; then
		_vf_git "$1" "$2" write-tree
		_vf_rc=$?
	else
		_vf_rc=1
	fi
	rm -rf "$_vf_tmp"
	return $_vf_rc
}

[ "${VERIFY_STAMP_LIB:-}" = 1 ] && return 0

top=$(git rev-parse --show-toplevel) || exit 1
common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
fingerprint=$(verify_fingerprint "$common" "$top") || {
	echo "verify-stamp: could not fingerprint $top" >&2
	exit 1
}
printf '%s\n' "$fingerprint" >"$top/.claude/.verify-stamp"
echo "verify-stamp: recorded $fingerprint for $top"
