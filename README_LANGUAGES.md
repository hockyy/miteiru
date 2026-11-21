# Miteiru Language Support

Miteiru splits subtitles into words, shows each word's reading, and looks words up in a dictionary that stays on your computer. Four languages are supported, each with its own tokenizer, dictionary and saved words.

## Languages

| | Japanese 日本語 | Mandarin 中文 | Cantonese 廣東話 | Vietnamese Tiếng Việt |
| --- | --- | --- | --- | --- |
| **Word splitting** | Miteiru's own Rust tokenizer: a MeCab-style lattice over IPADIC, with a JMdict-checked suffix engine that keeps inflected forms whole (見たよ → 見た + よ, base 見る) | Miteiru's Rust tokenizer with the Mandarin word list | Miteiru's Rust tokenizer with the Cantonese word list | Longest match over syllables, from the end of the line, against VNEDict |
| **Readings** | Furigana in hiragana, romaji | Whole-line pinyin with tone marks or numbers, from an in-house Rust port of [pinyin-pro 3.29.3](https://github.com/zh-lx/pinyin-pro) (MIT) | Jyutping with tone numbers or contour marks, from an in-house Rust port of [to-jyutping 3.1.1](https://github.com/CanCLID/to-jyutping) (BSD-2-Clause) | — (written as it is read) |
| **Dictionary** | JMdict, KANJIDIC2 | CC-CEDICT | CantoDict | VNEDict (54,375+ entries) |
| **Also** | Pitch accent (Kanjium), conjugation tables and the steps back to the dictionary form, kanji stroke order (KanjiVG) | HSK 3.0 levels, tone colours after tone sandhi, simplified and traditional forms, hanzi stroke order (Make Me a Hanzi) | Hanzi stroke order (Make Me a Hanzi) | A meaning under every word |

Mandarin and Cantonese each have an engine of their own (tokenizer, dictionary and Your dictionary), so one never changes the other. Traditional Mandarin is read for pinyin through a simplified copy of the line, since pinyin-pro knows its context words in simplified characters: 我們 is wǒ men, 什麼 is shén me. Subtitle conversions use an in-house Rust port of [opencc-js 1.4.1](https://github.com/nk2028/opencc-js) (MIT and Apache-2.0).

The Japanese tokenizer's design and evaluation are in [docs/JAPANESE_TOKENIZER.md](docs/JAPANESE_TOKENIZER.md); the Vietnamese one is in [docs/VIETNAMESE_IMPLEMENTATION.md](docs/VIETNAMESE_IMPLEMENTATION.md).

Japanese readings use kana and romaji conversion from an in-house port of the MIT-licensed [WanaKana 5.3.1](https://github.com/WaniKani/WanaKana).

## Choosing a language

On the Home screen, pick a language and press Watch, Continue, Study or Flashcards. The first time, Miteiru downloads the language's pack (Japanese: `japanese`; Mandarin: `mandarin` and `hanzi`; Cantonese: `cantonese` and `hanzi`; Vietnamese: `vietnamese`; see [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md)). The chosen language is used for:

- splitting subtitles into words and showing their readings,
- the dictionary when you click a word,
- learning mode and the saved words,
- the AI assistant tools, when a call names no language.

## Subtitle languages

A subtitle whose name marks it as English (`show.en.srt`, `show.eng.ass`, `show.english.vtt`, `show.en-US.srt`) is shown underneath to read along, without readings or word tracking. Any other subtitle is in the language you chose and is split into words.

## Saved words

Every word can be saved as **New** (0), **Learning** (1) or **Known** (2): clicking a word cycles through them, and the word popup sets one directly. Words are saved in their dictionary form (見た is saved as 見る), with the time, so a newer change wins when progress is synced. The words among the most frequent of a video (the video sidebar's "top N%" setting) show as already known (3) without being saved.

## Token structures

Each language's tokens, as the subtitles and the local API's `/analyze` receive them, are in [docs/TOKEN_STRUCTURES.md](docs/TOKEN_STRUCTURES.md).

## For other programs

[docs/LOCAL_API.md](docs/LOCAL_API.md): the AI assistant tools over MCP (`miteiru --mcp`), the local HTTP API, and the headless server that answers the same tools with Miteiru closed (`node scripts/miteiru-mcp.mjs`). Every text tool takes a language (`ja`, `zh-Hans`, `zh-Hant`, `yue`, `vi`), and `analyze_text` with `detail: "full"` gives every token's surface, dictionary form, part of speech, machine-stable reading, ruby, dictionary gloss with its entry id, JLPT, HSK and frequency levels, pitch accent, tones, conjugation and saved level.

## Technical implementation

- **Backend:** the language handlers in `main/` run in a Web Worker beside the page; the Rust shell (`src-tauri/`) provides files, processes, storage and the tokenizers. The page calls the backend through `window.backend.invoke(channel, ...args)`.
- **Tokenizers:** `native/rust/crates/miteiru-tokenizer` (Japanese, Mandarin and Cantonese), with the dictionary tables and their stores in `native/rust/crates/miteiru-langdata`. The app uses them through Tauri commands, and the headless server through a Node addon (`native/rust/crates/miteiru-node`), so both split text the same way.
- **Data:** language packs (`.mtrpack`) installed from the Home screen, holding each language's `language-assets`; small study data (pitch accents, HSK, JLPT and frequency lists) ships with the app in `renderer/public`. For development, `npm run script:initrepo` downloads the data.
- **Interface:** UI components and subtitle rendering in `renderer/`.

## Adding new languages

See the [Language Implementation Guide](docs/LANGUAGE_IMPLEMENTATION.md).

## Troubleshooting

### A language doesn't load

1. On the Home screen, open **Languages** and check that the language's packs are installed and up to date (**Update** when one is outdated).
2. Remove a pack that still won't load and download it again, or install it from a file.
3. Check the developer console for loading errors.

### Words are split wrongly

1. Make sure the subtitle is in the language chosen on the Home screen (an English-named subtitle is not split).
2. Check the subtitle file's encoding (UTF-8 is safest).
3. Add the word to Your dictionary: it is kept whole from then on.

### Slow subtitles

Very long subtitle lines take longer to split; a subtitle file of many thousands of lines is fine.

---

For more technical details, see the [Language Implementation Guide](docs/LANGUAGE_IMPLEMENTATION.md) and [Vietnamese Implementation Details](docs/VIETNAMESE_IMPLEMENTATION.md).
