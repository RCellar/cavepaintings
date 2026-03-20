#!/usr/bin/env bash
# Bump version across all project files that track it.
# Usage: bump-version.sh <new-version>
# Example: bump-version.sh 0.3.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "$1" ]]; then
  # Show current version and prompt
  CURRENT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PROJECT_ROOT/package.json','utf8')).version)")"
  echo "Current version: $CURRENT"
  echo ""
  echo "Usage: bump-version.sh <new-version>"
  echo "Example: bump-version.sh 0.3.0"
  exit 1
fi

NEW_VERSION="$1"

# Validate semver format
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g., 1.2.3)"
  exit 1
fi

# Files to update
FILES=(
  "$PROJECT_ROOT/package.json"
  "$PROJECT_ROOT/.claude-plugin/plugin.json"
  "$PROJECT_ROOT/.claude-plugin/marketplace.json"
)

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "Warning: $f not found, skipping"
    continue
  fi
  # Use node for reliable JSON field replacement
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$f', 'utf8'));
    const old = data.version;
    data.version = '$NEW_VERSION';
    // Also update version in plugins array if present (marketplace.json)
    if (data.plugins) {
      data.plugins.forEach(p => { if (p.version) p.version = '$NEW_VERSION'; });
    }
    fs.writeFileSync('$f', JSON.stringify(data, null, 2) + '\n');
    console.log('  ' + '$f'.replace('$PROJECT_ROOT/', '') + ': ' + old + ' → $NEW_VERSION');
  "
done

echo ""
echo "Version bumped to $NEW_VERSION"

# Refresh the local marketplace cache if it exists (skipped when called from release.sh)
if [[ -z "${CAVEPAINTINGS_SKIP_CACHE_REFRESH:-}" ]]; then
  MARKETPLACE_NAME="cavepaintings-marketplace"
  MARKETPLACE_CACHE="$HOME/.claude/plugins/marketplaces/$MARKETPLACE_NAME"

  if [[ -d "$MARKETPLACE_CACHE/.git" ]]; then
    echo "Refreshing marketplace cache..."
    echo "  Note: if you haven't pushed yet, use 'npm run release' instead"
    git -C "$MARKETPLACE_CACHE" fetch --quiet origin 2>/dev/null
    git -C "$MARKETPLACE_CACHE" reset --quiet --hard origin/HEAD 2>/dev/null \
      || git -C "$MARKETPLACE_CACHE" reset --quiet --hard origin/master 2>/dev/null
    echo "  $MARKETPLACE_CACHE updated"
  elif [[ -d "$MARKETPLACE_CACHE" ]]; then
    echo "Warning: marketplace cache exists but is not a git repo: $MARKETPLACE_CACHE"
    echo "  You may need to manually delete it and re-install the plugin"
  fi

  echo ""
  echo "Next steps:"
  echo "  1. git add -A && git commit -m 'chore: bump to $NEW_VERSION'"
  echo "  2. git push"
  echo "  3. /plugin update $MARKETPLACE_NAME"
  echo "  4. /reload-plugins"
  echo ""
  echo "Or use 'npm run release $NEW_VERSION' to do all of the above in one step."
fi
