#!/usr/bin/env bash
# Usage: report-issue.sh <title> <body>
# Comments on the open issue with this exact title, or opens one. Needs GH_TOKEN.
set -euo pipefail
title=$1
body=$2
number=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --search "\"$title\" in:title" \
  --json number,title --jq "map(select(.title == \"$title\")) | .[0].number // empty")
if [ -n "$number" ]; then
  gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$body"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body"
fi
