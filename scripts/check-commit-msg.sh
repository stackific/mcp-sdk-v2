#!/usr/bin/env bash
# commit-msg gate (lefthook): enforce a conventional-commit subject and the DCO
# `Signed-off-by` trailer that AGENTS.md requires. lefthook passes the commit
# message file path as {1}. Catches a missing sign-off locally — before it
# reaches GitHub's DCO check.
set -euo pipefail

msg_file="${1:?commit message file path required}"
subject="$(sed -n '1p' "$msg_file")"

# Skip auto-generated commits that don't follow the convention.
case "$subject" in
  Merge\ * | Revert\ * | "fixup! "* | "squash! "* | "Bump "*) exit 0 ;;
esac

types='feat|fix|chore|docs|refactor|test|build|ci|perf|style|revert'
if ! printf '%s' "$subject" | grep -qE "^(${types})(\([a-z0-9._/-]+\))?!?: .+"; then
  {
    echo "✖ commit subject is not a conventional commit:"
    echo "    ${subject}"
    echo "  expected: <type>(<scope>)?: <summary>"
    echo "  types: ${types//|/ }"
  } >&2
  exit 1
fi

if ! grep -qiE '^Signed-off-by: .+ <[^>]+@[^>]+>' "$msg_file"; then
  echo "✖ missing DCO sign-off trailer (AGENTS.md). Re-commit with: git commit -s" >&2
  exit 1
fi
