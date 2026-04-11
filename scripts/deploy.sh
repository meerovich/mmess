#!/usr/bin/env bash
# deploy.sh — pull latest, bump patch version, rebuild and restart containers.
#
# Version source of truth: the "version" field in the root package.json.
# Bump strategy: patch increment (e.g. 1.0.3 -> 1.0.4). Chosen over a git-SHA
# suffix because it gives humans a monotonic, memorable number in the UI;
# the SHA is still visible via `git log` on the host.
#
# The bumped version is exported as APP_VERSION and VITE_APP_VERSION so that:
#   - docker-compose.yml passes APP_VERSION to the api container env,
#   - the client build picks up VITE_APP_VERSION via Vite's `define`.
#
# Usage (on the VPS, from repo root):
#   ./scripts/deploy.sh
#
# This script is additive — it does NOT replace the existing manual
# `docker compose build && docker compose up -d` flow.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

PKG_JSON="package.json"

# Read current version using node so we don't add a jq dependency.
CURRENT_VERSION=$(node -p "require('./${PKG_JSON}').version")
echo "==> current version: ${CURRENT_VERSION}"

# Bump patch (x.y.z -> x.y.(z+1)).
NEW_VERSION=$(node -e "
const v = require('./${PKG_JSON}').version.split('.').map(Number);
if (v.length !== 3 || v.some(Number.isNaN)) {
  console.error('Invalid semver in package.json: ' + require('./${PKG_JSON}').version);
  process.exit(1);
}
v[2] += 1;
console.log(v.join('.'));
")
echo "==> new version:     ${NEW_VERSION}"

# Write new version back to package.json (in place, preserving 2-space indent).
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('${PKG_JSON}', 'utf8'));
p.version = '${NEW_VERSION}';
fs.writeFileSync('${PKG_JSON}', JSON.stringify(p, null, 2) + '\n');
"

# Export for docker compose + vite build.
export APP_VERSION="${NEW_VERSION}"
export VITE_APP_VERSION="${NEW_VERSION}"

echo "==> building client (VITE_APP_VERSION=${VITE_APP_VERSION})"
(cd client && VITE_APP_VERSION="${VITE_APP_VERSION}" npx vite build)

echo "==> docker compose build"
docker compose build

echo "==> docker compose up -d"
APP_VERSION="${APP_VERSION}" docker compose up -d

echo "==> deployed version ${NEW_VERSION}"
