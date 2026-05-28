#!/usr/bin/env bash
# Install gas-best-practices skill for Claude Code
set -e

REPO="${GAS_BP_REPO:-https://github.com/kpcrmv4/gas-best-practices}"
DEST="${HOME}/.claude/skills/gas-best-practices"

echo "Installing gas-best-practices skill..."
mkdir -p "$(dirname "$DEST")"
if [ -d "$DEST" ]; then
  echo "→ existing install found, updating..."
  cd "$DEST" && git pull --ff-only
else
  git clone --depth 1 "$REPO" "$DEST"
fi

echo ""
echo "✓ Installed at: $DEST"
echo ""
echo "Restart Claude Code. The skill will auto-trigger when:"
echo "  - Your project contains .clasp.json or appsscript.json"
echo "  - You edit .gs / .js files in a clasp project"
echo "  - You mention Google Apps Script / GAS / clasp"
