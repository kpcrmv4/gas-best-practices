#!/usr/bin/env bash
# Update gas-best-practices skill to the latest version
set -e

DEST="${HOME}/.claude/skills/gas-best-practices"

if [ ! -d "$DEST/.git" ]; then
  echo "✗ Skill not installed via git at: $DEST"
  echo "  Run install.sh to install first."
  exit 1
fi

cd "$DEST"
BEFORE=$(git rev-parse --short HEAD)
echo "→ Current: $BEFORE"
echo "→ Fetching from origin..."
git fetch --tags origin
AFTER_REMOTE=$(git rev-parse --short origin/main)

if [ "$BEFORE" = "$AFTER_REMOTE" ]; then
  echo "✓ Already up-to-date ($BEFORE)"
  exit 0
fi

echo "→ Updates available: $BEFORE → $AFTER_REMOTE"
echo ""
echo "Changes:"
git log --oneline "$BEFORE..origin/main" | head -20
echo ""

git pull --ff-only origin main
AFTER=$(git rev-parse --short HEAD)

echo ""
echo "✓ Updated: $BEFORE → $AFTER"
echo "  Restart Claude Code to reload the skill."
