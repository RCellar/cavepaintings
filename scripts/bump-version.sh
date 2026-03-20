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
echo "Next steps: commit, push, then update the plugin via /plugin"
