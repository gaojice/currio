#!/bin/bash
set -e

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version" 2>/dev/null || echo "1.0.0")
ZIP="currio-v${VERSION}.zip"

EXCLUDES=(
  "node_modules/*"
  ".git/*"
  "e2e/*"
  "test-results/*"
  "scripts/*"
  "*.DS_Store"
  ".DS_Store"
  "package*.json"
  "playwright*"
  "*.zip"
)

echo "Packaging Currio v${VERSION} → ${ZIP}"

# Build exclude args
EXCLUDE_ARGS=""
for pattern in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS -x \"$pattern\""
done

# Can't use array in simple shell, so use eval or temp file
echo "$EXCLUDE_ARGS" > /tmp/currio-excludes.txt

# Use rsync-style exclude with temp file
zip -r "$ZIP" . -x "node_modules/*" ".git/*" "e2e/*" "test-results/*" "scripts/*" "*.DS_Store" ".DS_Store" "package*.json" "playwright*" "*.zip" "Dockerfile*" "docker-compose*" "landing/*"

echo ""
echo "Done: $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "Upload this file to https://chrome.google.com/webstore/devconsole"
