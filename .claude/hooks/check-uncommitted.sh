#!/bin/bash
# Stop hook: when a turn ends with uncommitted changes in this repo, send Claude
# back to commit finished work in reasonably sized, logically grouped commits.
# Exits silently when there is nothing to commit, when already re-entered from
# this hook (stop_hook_active), or when not inside a git repository.

input=$(cat)
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)
[ "$active" = "true" ] && exit 0

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

changes=$(git status --porcelain 2>/dev/null)
[ -z "$changes" ] && exit 0

count=$(printf '%s\n' "$changes" | wc -l | tr -d ' ')
listing=$(printf '%s\n' "$changes" | head -25)
[ "$count" -gt 25 ] && listing="$listing
... and $((count - 25)) more"

reason="The repo has $count uncommitted change(s):
$listing

The user wants this repository to show a realistic commit history. If these changes are finished work, commit them now: group related files into logically separate commits with clear conventional messages (several focused commits beat one large one), then push. Do not fold unrelated changes into one commit. If the work is genuinely mid-task, or the user has said not to commit yet, stop without committing and say so briefly."

jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
