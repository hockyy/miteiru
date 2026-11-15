# Japanese readings in context: gold set

`gold.jsonl` holds 65 Japanese lines with their words and how each word is read **in that line**:
194 kanji words with a reading, among them 16 numeral + counter words and 8 names. It measures the
Japanese tokenizer's readings (furigana, lookups, Mathesis's `analyze_text`), not its word boundaries,
which `tests/fixtures/tokenizer-eval` measures.

Every line is a **hard case** written for this set: the classic context-dependent readings a teacher
meets. They include 日本酒 and 米から, 今日 (きょう and こんにち), 一日 (ついたち and いちにち), 人気 (にんき
and ひとけ), 上手 (じょうず, うわて and かみて), 市場, 生物, 色紙, 最中, 辛い, 角, 方, 行った (いった and
おこなった), counters (三本, 六本, 八本, 一本, 十個, 三日, 一か月, 二十歳, 一人, 二人, 十ページ), and names
(不知火, 常闇, 角巻, 宝鐘, 白銀, 兎田, 博衣, 風真). As `tests/fixtures/tokenizer-eval/GUIDELINES.md` asks of
that set, no line is copied from published subtitles.

## Format

One JSON object per line: `id`, `source` (`hard-case`), `category`, `text`, `tokens`, and an
optional `note`. Each token is `[surface]` for a word without kanji, or
`[surface, reading, alternatives?, flag?]`:

- `reading` is hiragana as furigana writes it: the dictionary's spelling, so は stays は and 先生 is
  せんせい, not the spoken form. `null` means not scored (a line cut inside a word, a name nobody can know).
- `alternatives` are other readings that are also right here (明日 あした, あす; 八本 はっぽん, はちほん;
  二十歳 はたち, にじゅっさい).
- `flag` is `counter` for a numeral + counter word, or `name`. Names are reported apart: a teacher pins
  those, and no dictionary has them all.

Tokens are learner-click units as in the tokenizer-eval guidelines, with one difference. A numeral and its
counter are one token here (三本), and the scorer accepts a split between them (Miteiru keeps 三 / 本
apart).

## How it was made

The lines were written first. Then UniDic (fugashi + unidic-lite 2.1.2), Sudachi
(SudachiDict-full 20261015, modes A and C) and Miteiru as it was then each analyzed every line. I,
Claude, went through those drafts, settled each word and reading by hand, and noted the hard calls.
The analyzers' outputs were only drafts. Each gold reading is my own judgement, checked against JMdict
where a reading is lexical. Readings follow the line's meaning: 行った in 卒業式を体育館で行った。 is
おこなった ("held"), and in 昨日は友達と映画を見に行った。 it is いった.

## Scoring

```
npx tsx scripts/eval/japaneseReadings.ts <predictions.json> [--errors]
```

`<predictions.json>` maps `{"<analyzer>": {"<id>": [{"s": surface, "r": reading}]}}` (kana).
Analyzers cut words differently, so a reading is compared over the shortest span whose edges both
cuts share. If an analyzer reads 日本 + 酒 as にほん + しゅ, 日本酒 is right; にっぽん + しゅ is wrong.
`tests/japaneseReadings.test.ts` runs Miteiru's own tokenizer (the Rust addon the app and the headless
server share) over the set.

## Results (2026-11-15)

Readings of the 186 scored words (names left out), from the scorer:

| Analyzer | Readings |
| --- | ---: |
| Miteiru (IPADIC lattice) | 84.9% (158) |
| UniDic (unidic-lite 2.1.2, MeCab) | 85.5% (159) |
| Sudachi, SudachiDict-full, mode C | 86.6% (161) |
| pyopenjtalk-plus 0.4.1.post10 (OpenJTalk) | 90.9% (169) |
| its dictionary alone (`use_vanilla`) | 91.9% (171) |

The hard cases were written knowing those phenomena, so the second check is the JVS kana benchmark
(`scripts/eval/jvsKana.ts`). Its 2,756 lines without digits or Latin letters measure reading
character error rates of 1.10% for Miteiru, 1.12% for UniDic (unidic-lite) and 0.55% for
pyopenjtalk-plus.
