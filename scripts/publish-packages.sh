#!/usr/bin/env bash
# Publish @ani-hq/* packages to npm.
# Requires: valid npm auth (npm login or NPM_TOKEN), and ownership of the @ani-hq scope.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN="${DRY_RUN:-false}"
PACKAGES=(tracker agent-tracker agent-mcp)

if [[ -n "${NPM_TOKEN:-}" ]]; then
  echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "${HOME}/.npmrc-cairo-publish"
  export NPM_CONFIG_USERCONFIG="${HOME}/.npmrc-cairo-publish"
fi

echo "==> Checking npm auth"
if ! npm whoami >/dev/null 2>&1; then
  echo "ERROR: not logged in to npm."
  echo "  Run: npm login"
  echo "  Or set NPM_TOKEN to an automation token with publish rights on @ani-hq"
  exit 1
fi
echo "Logged in as: $(npm whoami)"

echo "==> Building workspaces"
cd "$ROOT"
npm run build

for pkg in "${PACKAGES[@]}"; do
  dir="$ROOT/packages/$pkg"
  name="$(node -p "require('$dir/package.json').name")"
  version="$(node -p "require('$dir/package.json').version")"
  echo "==> Publishing $name@$version"
  cd "$dir"
  if [[ "$DRY_RUN" == "true" ]]; then
    npm publish --access public --dry-run
  else
    # idempotent: skip if already published
    if npm view "${name}@${version}" version >/dev/null 2>&1; then
      echo "    already published, skipping"
    else
      npm publish --access public
    fi
  fi
done

echo "==> Done"
npm view @ani-hq/tracker version || true
npm view @ani-hq/agent-tracker version || true
npm view @ani-hq/agent-mcp version || true
