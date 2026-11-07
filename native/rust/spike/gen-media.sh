#!/usr/bin/env bash
# Generates the spike's four test videos into $SPIKE_S/media (see README.md).
# Needs ffmpeg with libx265, libx264, hevc_nvenc (NVIDIA) and the dca, ac3 and eac3 encoders.
set -eu
: "${SPIKE_S:?Set SPIKE_S to the spike work folder}"
here="$(cd "$(dirname "$0")" && pwd)"
M="$SPIKE_S/media"
mkdir -p "$M"
cp "$here/subs-ja.ass" "$M/subs-ja.ass"
cd "$M"
FF="ffmpeg -y -hide_banner -loglevel error -nostats"

echo "[1/4] HEVC 10-bit 1080p23.976 + DTS 5.1 + AC3 + Japanese ASS (60 s)"
$FF -f lavfi -i "testsrc2=size=1920x1080:rate=24000/1001:duration=60" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=60" \
  -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=60" \
  -i subs-ja.ass \
  -map 0:v -map 1:a -map 2:a -map 3:s \
  -c:v libx265 -preset fast -crf 24 -pix_fmt yuv420p10le -x265-params log-level=error \
  -c:a:0 dca -strict -2 -ac:a:0 6 -b:a:0 768k \
  -c:a:1 ac3 -ac:a:1 2 -b:a:1 192k \
  -c:s ass \
  -metadata:s:a:0 language=jpn -metadata:s:a:0 title="Japanese DTS 5.1" \
  -metadata:s:a:1 language=eng -metadata:s:a:1 title="English AC3" \
  -metadata:s:s:0 language=jpn -metadata:s:s:0 title="Japanese ASS" \
  hard1080-hevc10-dts-ac3-ass.mkv

echo "[2/4] H.264 High 10 1080p23.976 + AC3 + ASS (30 s)"
$FF -f lavfi -i "testsrc2=size=1920x1080:rate=24000/1001:duration=30" \
  -f lavfi -i "sine=frequency=550:sample_rate=48000:duration=30" \
  -i subs-ja.ass \
  -map 0:v -map 1:a -map 2:s \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p10le -profile:v high10 \
  -c:a ac3 -ac 2 -b:a 192k -c:s ass \
  hi10p1080-h264-10bit-ac3-ass.mkv

echo "[3/4] HEVC 10-bit 4K60 (NVENC) + E-AC3 (30 s)"
$FF -f lavfi -i "testsrc2=size=3840x2160:rate=60:duration=30" \
  -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=30" \
  -map 0:v -map 1:a \
  -c:v hevc_nvenc -preset p4 -pix_fmt p010le -b:v 40M \
  -c:a eac3 -ac 2 -b:a 224k \
  uhd60-hevc10-eac3.mkv

echo "[4/4] H.264 8-bit + AAC MP4 baseline that Chromium can play (60 s)"
$FF -f lavfi -i "testsrc2=size=1920x1080:rate=24000/1001:duration=60" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=60" \
  -map 0:v -map 1:a \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart \
  baseline1080-h264-aac.mp4

echo "done: $M"
