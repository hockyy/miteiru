#!/bin/bash
# Usage: capture/open.sh <port> <subtitle-file> — from Home: Open video, drop media/scenery.mp4 with the
# subtitle and the English one, load it as primary, and pause at 0:03.
HERE="$(cd "$(dirname "$0")" && pwd)"
PROMO="$(dirname "$HERE")"
MEDIA="$(cygpath -m "$PROMO/media" 2>/dev/null || echo "$PROMO/media")"
node "$HERE/cdp.mjs" $1 "$(cat "$HERE/ui.js")" > /dev/null
node "$HERE/cdp.mjs" $1 "__ui.click('Open video')"
for i in $(seq 1 40); do node "$HERE/cdp.mjs" $1 "location.href" | grep -q video && break; sleep 1; done
sleep 3
node "$HERE/act.mjs" $1 drop "$MEDIA/scenery.mp4" "$MEDIA/$2" "$MEDIA/scenery.en.srt" > /dev/null
sleep 4
node "$HERE/cdp.mjs" $1 "$(cat "$HERE/ui.js")" > /dev/null
node "$HERE/cdp.mjs" $1 "__ui.click('Load as primary')"
sleep 6
node "$HERE/cdp.mjs" $1 "(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 3; return v.duration; })()"
