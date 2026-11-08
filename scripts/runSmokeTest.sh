#!/usr/bin/env bash
# Runs the app's smoke test (renderer/platform/smokeTest.ts) and takes a screenshot halfway through.
# macOS or Linux (under xvfb-run on a headless machine):
#   scripts/runSmokeTest.sh <app binary> <results.json> <screenshot.png>
set -u
app_binary=$1
export MITEIRU_SMOKE_TEST=$2
screenshot=$3

# MITEIRU_SMOKE_GDB=1 runs the app under gdb, which prints every thread's stack if it crashes.
if [ "${MITEIRU_SMOKE_GDB:-}" = "1" ] && command -v gdb >/dev/null; then
  gdb -q -batch -ex "handle SIGPIPE nostop noprint" -ex run -ex "thread apply all bt 25" --args "$app_binary" &
else
  "$app_binary" &
fi
app=$!
shoot() {
  if [ "$(uname)" = "Darwin" ]; then screencapture -x "$1" || true; else import -window root "$1" || true; fi
}
# One while the home page shows, one while the player test draws under the hidden page.
sleep 6
shoot "${screenshot%.png}-early.png"
sleep 24
shoot "$screenshot"
# The test exits the app when done: 35-40 s after start once it runs, but a cold start on a slow
# runner (under gdb, building GStreamer's plugin registry) took 109 s to its first video frame, and a
# 120 s limit cut that run off mid-test. Wait up to 4 minutes in all, like the Windows install test.
for _ in $(seq 1 210); do
  kill -0 "$app" 2>/dev/null || break
  sleep 1
done
kill "$app" 2>/dev/null || true
code=0
wait "$app" || code=$?
echo "app exit code: $code"
