# Miteiru promo video

A 36-second, 1080p60 promo for Miteiru, made with [Remotion](https://www.remotion.dev/) (React → MP4). The
music and sound effects are generated in code, and the cuts land on their beat grid.

```bash
npm ci
npm run music      # music/make_music.py → public/music.wav and public/sfx/*.wav (needs Python, numpy, scipy)
npm run render     # → out/miteiru-promo.mp4
npm run master     # → out/miteiru-promo-final.mp4: audio peaks limited to −0.5 dBFS (needs ffmpeg on PATH)
npm run thumbnail  # → out/thumbnail.jpg (1280×720, for YouTube)
npm run studio     # preview and scrub in the browser
```

## How it is put together

- **Beat grid.** The music is 150 BPM at 60 fps: one beat is 24 frames and one bar is 96. `at(bar, beat)` in
  `src/anim.ts` gives the frame, and `src/Promo.tsx` places every scene and sound effect on that grid.
  `music/cues.json` lists what the track does where: the drops at 9.6 s and 32.0 s, the silent gaps before
  them, the snare rolls and fills.
- **Real app footage.** `public/caps/*.png` are screenshots of the real app at 1600×900 CSS pixels, device
  scale 2, with the `<video>` made transparent. `AppWindow` (`src/ui.tsx`) plays `Scenery` (an original,
  animated SVG landscape) underneath them, so the app looks like it is playing. `src/crops.json` holds the
  rectangles cut out of them.
- **Recreated pieces.** The seek bar, the stroke-by-stroke kanji (KanjiVG data in `src/strokes.ts`, the
  same Miteiru ships) and the verb chain are React components, so they can move on the beat.
- **Scenes.** `src/scenesIntro.tsx` (intro, build, logo drop), `src/scenesApp.tsx` (app tour, kanji, verbs,
  languages) and `src/scenesOutro.tsx` (16-feature montage, "Free. Open source.", end card).

## Retaking the app screenshots

When the app's look changes, retake the screenshots from a fresh build, on a scratch profile:

```bash
npx nextron build --no-pack                     # from the repo root
cd promo && npm run scenery                     # media/scenery.mp4: the clip the app plays
bash capture/launch.sh 9334                     # Miteiru on promo/.capture-profile
bash capture/open.sh 9334 scenery.ja.srt        # open the clip with Japanese + English subtitles
node capture/cdp.mjs 9334 "$(cat capture/clear.js)"           # hide the video for a transparent shot
node capture/snap.mjs 9334 public/caps/jp-paused.png 1600 900 2 clear
bash capture/lang.sh 9334 3 scenery.zh.srt zh-playing         # other languages: 2 yue, 3 zh, 4 vi
```

`capture/act.mjs` clicks, hovers, scrolls, presses keys and drops files; `capture/rclick.mjs` right-clicks
(to set learning states). Positions are CSS pixels in the 1600×900 layout. `capture/preview.py` composites
a transparent shot over magenta to check it. To check frames of the video without a full render,
`node stills.mjs 600 900 1500` writes them to `out/stills/`.

Every feature the video shows was checked against the app. Keep it that way when editing.

## YouTube

**Title:** Miteiru — learn Japanese, Chinese, Cantonese & Vietnamese from any video | free & open source

**Description:**

```
Miteiru (見ている, "watching") is a free, open-source video player that turns the subtitles of whatever you watch into a lesson, for Japanese, Mandarin, Cantonese and Vietnamese.

⬇ Download for Windows, macOS and Linux: https://miteiru.hocky.id
⭐ Source code: https://github.com/hockyy/miteiru

What it does
• Furigana, romaji, pinyin and jyutping over every word, with short meanings underneath
• Click any word for its dictionary entry, pitch accent, kanji breakdown and stroke order
• Verb chains stay one word and are looked up by their dictionary form (食べてしまいました → 食べる)
• Colour words by how well you know them, review them as flashcards, and export them to Anki
• Two subtitles at once, karaoke lyrics, and every subtitle line marked on the seek bar
• Local videos and YouTube links; srt, ass, vtt and lrc subtitles
• Offline dictionaries: JMdict, KANJIDIC, CC-CEDICT, CantoDict, VNEDict
• Optional AI translations (formal, neutral or casual) with your own OpenRouter key

Credits
Dictionary data: JMdict and KANJIDIC (EDRDG), CC-CEDICT, CantoDict, VNEDict. Stroke order: KanjiVG (CC BY-SA 3.0).
The music, sound effects and motion graphics were made in code with Remotion.

#LanguageLearning #LearnJapanese #LearnChinese
```

**Tags:** language learning, learn japanese, learn chinese, learn cantonese, learn vietnamese, furigana,
pinyin, jyutping, anki, immersion, subtitles, video player, open source

**Category:** Education · **Thumbnail:** `out/thumbnail.jpg`
