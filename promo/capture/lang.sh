#!/bin/bash
# Usage: capture/lang.sh <port> <language-value> <subtitle-file> <out-name> — go Home, switch the language
# stack (0 Japanese, 2 Cantonese, 3 Mandarin, 4 Vietnamese), open the clip and capture line 1 while it
# plays (controls faded) to public/caps/<out-name>.png, with the video transparent.
HERE="$(cd "$(dirname "$0")" && pwd)"
PROMO="$(dirname "$HERE")"
CAPS="$(cygpath -m "$PROMO/public/caps" 2>/dev/null || echo "$PROMO/public/caps")"
node "$HERE/act.mjs" $1 key KeyH h 2 > /dev/null; sleep 2
node "$HERE/cdp.mjs" $1 "$(cat "$HERE/setlang.js")('$2')"; sleep 8
bash "$HERE/open.sh" $1 $3
node "$HERE/cdp.mjs" $1 "$(cat "$HERE/clear.js")" > /dev/null
node "$HERE/cdp.mjs" $1 "(() => { const v = document.querySelector('video'); v.currentTime = 1.6; v.play(); return 1; })()" > /dev/null
node "$HERE/act.mjs" $1 hover 800 400 > /dev/null; sleep 3.9
node "$HERE/snap.mjs" $1 "$CAPS/$4.png" 1600 900 2 clear > /dev/null
node "$HERE/cdp.mjs" $1 "(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 3; return 1; })()" > /dev/null
echo captured $4
