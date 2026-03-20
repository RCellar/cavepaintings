#!/usr/bin/env bash
# Release a new version: bump, commit, push, and refresh plugin cache.
# Usage: release.sh <new-version>
# Example: release.sh 0.2.0
#
# This replaces the manual 4-step workflow:
#   1. npm run bump 0.2.0
#   2. git add -A && git commit
#   3. git push
#   4. /plugin update (still manual — Claude Code CLI command)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "$1" ]]; then
  CURRENT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PROJECT_ROOT/package.json','utf8')).version)")"
  echo "Current version: $CURRENT"
  echo ""
  echo "Usage: release.sh <new-version>"
  echo "Example: release.sh 0.2.0"
  exit 1
fi

NEW_VERSION="$1"

# Validate semver
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g., 1.2.3)"
  exit 1
fi

echo "=== Releasing cavepaintings v$NEW_VERSION ==="
echo ""

# Step 1: Bump version in all files
echo "1. Bumping version..."
bash "$SCRIPT_DIR/bump-version.sh" "$NEW_VERSION"
echo ""

# Step 2: Commit
echo "2. Committing..."
cd "$PROJECT_ROOT"
git add -A
git commit -m "chore: bump to $NEW_VERSION" --quiet
echo "   Committed"

# Step 3: Push
echo "3. Pushing..."
git push --quiet
echo "   Pushed"

# Step 4: Clean old versions from plugin cache
PLUGIN_CACHE="$HOME/.claude/plugins/cache/cavepaintings-marketplace/cavepaintings"
if [[ -d "$PLUGIN_CACHE" ]]; then
  echo "4. Cleaning old plugin cache versions..."
  for dir in "$PLUGIN_CACHE"/*/; do
    version="$(basename "$dir")"
    if [[ "$version" != "$NEW_VERSION" && -d "$dir" ]]; then
      rm -rf "$dir"
      echo "   Removed $version"
    fi
  done
fi

echo ""
echo "=== v$NEW_VERSION released ==="
echo ""
echo "Next: run these in Claude Code:"
echo "  /plugin update cavepaintings@cavepaintings-marketplace"
echo "  /reload-plugins"
