#!/bin/bash
# Usage: capture/launch.sh <port> — start the built Miteiru on a scratch profile, kept "visible" for capture.
# Build first from the repo root: npx nextron build --no-pack. Never point this at your real profile.
HERE="$(cd "$(dirname "$0")" && pwd)"
PROMO="$(dirname "$HERE")"
REPO="$(dirname "$PROMO")"
PROFILE="$(cygpath -m "$PROMO/.capture-profile" 2>/dev/null || echo "$PROMO/.capture-profile")"
cd "$REPO"
node_modules/.bin/electron . "--user-data-dir=$PROFILE" --remote-debugging-port=$1 \
  --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows > "$PROMO/.capture-electron.log" 2>&1 &
for i in $(seq 1 40); do curl -s http://127.0.0.1:$1/json 2>/dev/null | grep -q '"page"' && break; sleep 1; done
sleep 3
node "$HERE/cdp.mjs" $1 "$(cat "$HERE/ui.js")" > /dev/null
echo launched
