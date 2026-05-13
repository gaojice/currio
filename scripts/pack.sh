#!/bin/bash
set -e

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version" 2>/dev/null || echo "1.0.0")
ZIP="currio-v${VERSION}.zip"

EXCLUDES=(
  "node_modules/*"
  ".git/*"
  ".claude/*"
  ".github/*"
  ".wolf/*"
  "e2e/*"
  "test-results/*"
  "scripts/*"
  "*.DS_Store"
  ".DS_Store"
  "package*.json"
  "playwright*"
  "*.zip"
  "CLAUDE.md"
)

echo "Packaging Currio v${VERSION} → ${ZIP}"

# Rebuild from scratch so excluded files from an older archive cannot linger.
rm -f "$ZIP"
zip -r "$ZIP" . -x "${EXCLUDES[@]}" "Dockerfile*" "docker-compose*" "landing/*"

echo ""
echo "Done: $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "Upload this file to https://chrome.google.com/webstore/devconsole"
