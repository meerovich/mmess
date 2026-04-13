#!/bin/bash
# fast-deploy.sh — Windows-side deploy to VPS with timing
# Usage: bash scripts/fast-deploy.sh <version> [--client-only]
#
# --client-only: skip API rebuild (only update static files + restart caddy)

set -e

VERSION=${1:?Usage: fast-deploy.sh <version> [--client-only]}
CLIENT_ONLY="${2:-}"

VPS="root@45.38.19.77"
HOSTKEY="SHA256:dhOYAcItnHaRvOTDccyfLk8p+1ZlqVZzXgWdZmVuY4c"
PW='6NPFK8FUQZKcn5rT_'
PLINK='"C:/Program Files/PuTTY/plink.exe"'
PSCP='"C:/Program Files/PuTTY/pscp.exe"'
SSH="$PLINK -batch -hostkey $HOSTKEY -pw $PW $VPS"
SCP="$PSCP -batch -hostkey $HOSTKEY -pw $PW"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ts() { date +%H:%M:%S; }

echo "$(ts) === Deploy v$VERSION ==="

# 1. Build client locally
echo "$(ts) [1/5] Building client..."
cd "$ROOT/client"
VITE_APP_VERSION=$VERSION npx vite build 2>&1 | tail -3

# 2. Tar + upload
echo "$(ts) [2/5] Uploading..."
cd "$ROOT"
rm -f client-dist.tar.gz
tar -czf client-dist.tar.gz -C client/dist .
eval $SCP client-dist.tar.gz $VPS:/opt/mmess/client-dist.tar.gz 2>&1
rm -f client-dist.tar.gz

# 3. Git pull + extract on VPS
echo "$(ts) [3/5] Extracting on VPS..."
eval $SSH "\"cd /opt/mmess && git fetch origin && git reset --hard origin/main && rm -rf client/dist && mkdir -p client/dist && tar -xzf client-dist.tar.gz -C client/dist && rm client-dist.tar.gz && sed -i 's/\\\"version\\\": \\\"[0-9.]*\\\"/\\\"version\\\": \\\"$VERSION\\\"/' package.json\"" 2>&1

# 4. Rebuild + restart
if [ "$CLIENT_ONLY" = "--client-only" ]; then
  echo "$(ts) [4/5] Client-only: restarting caddy..."
  eval $SSH "\"cd /opt/mmess && APP_VERSION=$VERSION docker compose --env-file .env.production up -d --force-recreate caddy\"" 2>&1
else
  echo "$(ts) [4/5] Building API + restarting..."
  eval $SSH "\"cd /opt/mmess && DOCKER_BUILDKIT=1 APP_VERSION=$VERSION docker compose --env-file .env.production build api 2>&1 | tail -5 && APP_VERSION=$VERSION docker compose --env-file .env.production up -d --force-recreate api caddy\"" 2>&1
fi

# 5. Health check
echo "$(ts) [5/5] Health check..."
sleep 8
node -e "fetch('https://chatboris.mooo.com/api/health').then(r=>r.text()).then(t=>console.log(t)).catch(()=>console.log('FAIL'))"

echo "$(ts) === Done ==="
