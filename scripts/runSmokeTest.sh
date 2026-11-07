#!/usr/bin/env bash
# Runs the app's smoke test (renderer/platform/smokeTest.ts) and takes a screenshot halfway through.
# macOS or Linux (under xvfb-run on a headless machine):
#   scripts/runSmokeTest.sh <app binary> <results.json> <screenshot.png>
set -u
app_binary=$1
export MITEIRU_SMOKE_TEST=$2
screenshot=$3

"$app_binary" &
app=$!
sleep 30
if [ "$(uname)" = "Darwin" ]; then
  screencapture -x "$screenshot" || true
else
  import -window root "$screenshot" || true
fi
# The test exits the app when done (about 40 s after start).
for _ in $(seq 1 90); do
  kill -0 "$app" 2>/dev/null || break
  sleep 1
done
kill "$app" 2>/dev/null || true
code=0
wait "$app" || code=$?
echo "app exit code: $code"
