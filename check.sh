#!/usr/bin/env bash
# Check status of gas-best-practices skill — version, updates available, rules count
set -e

DEST="${HOME}/.claude/skills/gas-best-practices"

echo "gas-best-practices status"
echo "========================="

if [ ! -d "$DEST" ]; then
  echo "✗ Not installed"
  echo "  Install: curl -fsSL https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.sh | bash"
  exit 1
fi

echo "Location: $DEST"

if [ ! -d "$DEST/.git" ]; then
  echo "⚠ Installed (not via git — can't check for updates)"
  exit 0
fi

cd "$DEST"
CURRENT=$(git rev-parse --short HEAD)
CURRENT_DATE=$(git log -1 --format=%cd --date=short)
TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "(no tag)")

echo "Version : $TAG"
echo "Commit  : $CURRENT ($CURRENT_DATE)"
echo "Rules   : $(ls rules/*.md 2>/dev/null | wc -l) files"

echo ""
echo "→ Checking remote..."
git fetch --tags origin >/dev/null 2>&1 || { echo "✗ Cannot reach remote"; exit 1; }

REMOTE=$(git rev-parse --short origin/main)
if [ "$CURRENT" = "$REMOTE" ]; then
  echo "✓ Up-to-date"
else
  BEHIND=$(git rev-list --count "$CURRENT..origin/main")
  echo "⚠ $BEHIND commit(s) behind: $CURRENT → $REMOTE"
  echo ""
  echo "Run to update:"
  echo "  bash $DEST/update.sh"
fi
