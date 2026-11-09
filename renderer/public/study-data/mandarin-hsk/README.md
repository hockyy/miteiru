# Mandarin HSK 3.0 word levels

Source: https://github.com/drkameleon/complete-hsk-vocabulary

Pinned commit: `7ac65bf1a6387d35f1ade478906172a19311c7f9`

Input: [`complete.min.json`](https://github.com/drkameleon/complete-hsk-vocabulary/blob/7ac65bf1a6387d35f1ade478906172a19311c7f9/complete.min.json).
The upstream MIT licence was checked and is reproduced in [LICENSE](LICENSE).
Only word forms and HSK 3.0 membership are copied, without definitions or other dictionary content.

Regenerate from the repository root:

```sh
npx tsx scripts/data/buildMandarinHsk.ts
```

`words.json` maps simplified and all source traditional forms to their earliest
HSK 3.0 level: 17,700 forms, 195,452 bytes (190.9 KiB) of minified UTF-8 JSON.
Old HSK and TOCFL entries are excluded. Levels 1–6 are individual
levels; **7 means the combined advanced 7–9 band**, as published by the source
and the HSK 3.0 standard. No artificial split into 7, 8 and 9 is made. The UI
labels it “HSK 7–9”; an “above 7” or “above 8” filter keeps that band highlighted,
and “above 9” removes it. Unlisted words have their own dashed underline.

## Installed builds

Next copies `public/study-data/` into the static renderer export. Unlike the
large dictionaries in `public/language-assets/`, `scripts/pruneRendererExport.mjs`
leaves it in `app/`, which Tauri embeds in every app update. That also reaches
people with an already installed Mandarin pack: packs are versioned and
SHA-256 checked, so relying on a new file in an old pack would leave them without
HSK data until a pack update. No pack format, manifest or pack builder changes
are needed.

The renderer fetches this same-origin JSON only while Mandarin is loaded and
HSK highlighting is on. The shared loader caches the lookup across subtitle and
popup consumers; a missing, invalid or unavailable file resolves to no lookup,
without errors, invented levels or unlisted marks on every word.
