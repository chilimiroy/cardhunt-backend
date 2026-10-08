#!/bin/bash
# gatedpush.sh — the ONLY way to push (CLAUDE.md, Deploying; Roy 2026-10-09).
#
# Runs the full suite on a CLEAN checkout of HEAD (a temporary git worktree,
# so nothing local and untracked can make it pass) and pushes only if every
# suite exited 0. Five times something went out, or reported green, without
# having run (PROGRESS 2026-10-08/09).
#
#   bash gatedpush.sh             full suite on a clean checkout, then push
#   bash gatedpush.sh --no-push   the same check, no push
#
# node_modules is reached through NODE_PATH, never linked into the worktree:
# `git worktree remove --force` deletes THROUGH a junction (CLAUDE.md, LESSONS 5).
set -u
REPO="$(git rev-parse --show-toplevel)" || exit 2
cd "$REPO" || exit 2
WT="${TMPDIR:-/tmp}/cardhunt-gate-$$"
OUT="${TMPDIR:-/tmp}/cardhunt-gate-$$.txt"
git worktree prune
git worktree add -q "$WT" HEAD || { echo "could not make a clean checkout"; exit 2; }
export NODE_PATH="$REPO/node_modules"
( cd "$WT" && for f in *.test.js jptest.js; do
    out=$(timeout 300 node "$f" 2>&1); code=$?
    echo "$f exit=$code $(echo "$out" | grep -iE "passed|failed|assertion count" | tail -1)"
  done ) > "$OUT" 2>&1
git worktree remove --force "$WT"
n=$(grep -c " exit=" "$OUT"); failed=$(grep -c " exit=[^0]" "$OUT")
grep " exit=[^0]" "$OUT"
expected=$(ls *.test.js jptest.js 2>/dev/null | wc -l)
echo "suites: $n of $expected, failed: $failed, HEAD $(git rev-parse --short HEAD)"
rm -f "$OUT"
if [ "$failed" -ne 0 ] || [ "$n" -lt "$expected" ] || [ "$n" -eq 0 ]; then echo "NOT PUSHED"; exit 1; fi
if [ "${1:-}" = "--no-push" ]; then echo "(not pushing: --no-push)"; exit 0; fi
git push
