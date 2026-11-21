# Japanese tokenizer

Miteiru owns the tokenizer logic in `native/rust/crates/miteiru-tokenizer/src/japanese*`. Nothing is downloaded at run time. The worker uses the Rust commands `japanese_load`, `japanese_set_words`, `japanese_tokenize` and `japanese_tokenize_batch`. The installed Japanese pack supplies the same IPADIC files and JMdict MTRPACK2 table as before. JMdict validates suffix bases by default; its headword-node layer is an explicit opt-in. Readings in context come from a word-cost table built into the tokenizer and a readings pass after the lattice (see [Readings in context](#readings-in-context)). There is no pack-format or UI change.

IPADIC uses the Japanese pack's existing `dict/*.dat` layout. The dictionary and compatibility notices are in the [tokenizer NOTICE](../native/rust/crates/miteiru-tokenizer/NOTICE).

## Design and research

This is an engineering choice for our shipped resources, not a claim of universal state-of-the-art accuracy. A MeCab-style minimum-cost lattice is the strongest practical foundation here: IPADIC already supplies lexical costs, context IDs and a trained transition matrix. A different segmentation model would need training data or dictionaries we do not ship.

- [Vibrato](https://github.com/daac-tools/vibrato) and its [compact lattice](https://github.com/daac-tools/vibrato/blob/main/vibrato/src/tokenizer/lattice.rs) motivate contiguous nodes, integer predecessors and locality in transition lookups. Our connection matrix is transposed once so predecessor-right IDs for one candidate-left ID lie in a contiguous row. IPADIC's approximately 3.3 MiB matrix does not justify Vibrato's more complex large-matrix ID remapping. We implement the existing byte double-array format directly: no new trie dependency, conversion, string slicing or feature parsing in the hot lookup loop.
- [Sudachi's splitting and normalization](https://github.com/WorksApplications/Sudachi) motivate distinguishing morphological tokens from learner units and retaining original offsets through normalization. We cannot reproduce Sudachi's A/B/C dictionaries without their split metadata. Instead, conservative JMdict noun compounds compete as lattice nodes; typed suffix paths create learner units. Only half-width katakana (including paired voicing marks) and full-width ASCII get normalized lookup alternatives, at a small penalty. Original surfaces are never rewritten. Broad NFKC, lowercasing, speculative spelling repair and indiscriminate expression merging are deliberately excluded.
- [MeCab unknown-word definitions](https://taku910.github.io/mecab/unk.html) motivate keeping the shipped character categories, invocation and grouping rules. We precompute unknown run ends, count Unicode scalars rather than UTF-16 code units, and retain all punctuation, spaces and emoji. Bounded shape alternatives keep mixed Latin labels (`Wi-Fi`, `USB-C`, handles, alphanumerics), decimal/percentage/time numerals and uninterrupted kanji numerals together without absorbing neighboring Japanese. NUL cannot become a double-array terminal inside an input word. Unknown readings remain absent unless a validated suffix chain can retain the known head reading plus literal kana.
- The owner's `miteiru-ios/core/src/deinflect.rs` supplies the from-scratch typed ending-rewrite approach. Our bounded, suffix-indexed rewrite search checks word-type conditions and actual JMdict lemmas before composing a learner unit. It handles te auxiliaries, desire, excess, adjective nominalization, colloquial contractions and honorific helpers. It can repair a non-JMdict inflected base only when a typed rewrite reaches a real JMdict lemma. It does not join arbitrary hiragana strings, cross punctuation, or consume a user-defined word. `parseJapaneseVerbs` leaves discourse particles and modality separate in learner mode. `らしい`, `っす`, `じゃん`, `っけ`, explanatory `んだ` and quotation `って` are recognized but not indiscriminately attached to content words: the published gold guidelines explicitly prefer separate learner clicks.

The loader trims kuromoji's unused zero-filled buffers; features are decoded only for the winning path. It validates map bounds, context IDs, matrix dimensions and character definitions. `flate2` was already used by Tauri; `unicode-normalization` supplies standard Unicode tables, not tokenizer logic. Extra tries are built directly from sorted prefix ranges into flat 32-bit node/edge indexes, without a temporary tree allocation per node. The lemma map retains just boxed surfaces and type bits, not every JMdict reading twice.

All token-object fields remain available: surface, POS/details, conjugation type/form, dictionary base, reading and pronunciation. Known morphology keeps IPADIC metadata; a composed learner unit keeps the head's type, final inflection form and the concatenated surface readings. Dictionary words use their JMdict reading; the caller supplies user readings/meanings. Positions are one-based Unicode scalar offsets in the original text, and IDs are opaque (negative for extra words). The repair pass cannot split an inflected auxiliary such as `ちゃわ` in `忘れちゃわない`. Honorific composition excludes lexical suru nouns such as `おかわり`; nominal copulas remain separate from their nouns.

## Readings in context

A word's reading is what furigana, lookups and the language tools show (`analyze_text` gives it to
Mathesis, whose teachers rely on it). IPADIC's lattice alone read 日本酒 as 日本 + 酒 (にっぽん + しゅ)
and 米から as べい, 一本 as いちほん, 二人 as ににん, and どこ行った as おこなった. Two parts fix this, in
the shared Rust tokenizer, so the app and the headless server read the same.

**Research.** I compared alternatives a Rust or Node app can embed on CPU, on a gold set of 65 lines
written as hard cases (`tests/fixtures/japanese-readings`, 186 scored kanji words). The second check
was the JVS kana benchmark (arXiv 2606.22009; `scripts/eval/jvsKana.ts`; 2,756 lines without digits).
Both guided the design, so the blind check came last: on 378 lines of real clip subtitles not looked at
before (not in this repo), the old and new tokenizer read 33 spans differently. 30 are better now, 3
unclear (角 twice, あり得る), none worse.

| Analyzer | Gold readings | JVS reading CER |
| --- | ---: | ---: |
| Miteiru before (IPADIC) | 84.9% | 1.10% |
| UniDic (unidic-lite 2.1.2, as MeCab, Vibrato or Lindera run it) | 85.5% | 1.12% |
| Sudachi with SudachiDict-full (modes A and C) | 86.6% | |
| pyopenjtalk-plus 0.4.1.post10 (OpenJTalk; NAIST-jdic, UniDic-CSJ) | 90.9% | 0.55% |
| that dictionary alone, without its post-processing | 91.9% | |
| **Miteiru now** | **94.6%** | **0.78%** |

The paper's own kana error rates on JVS agree on the order: OpenJTalk 1.03%, KyTea 1.42%, MeCab with
UniDic 1.54%, MeCab with IPADIC 1.78%, Sudachi 1.83%. The best measured reader is pyopenjtalk-plus's
dictionary, an IPADIC descendant with years of cost audits and reading fixes. Switching to it would
double the tokenizer's dictionary (790,000 entries against 392,000; by its file sizes, an estimated
30 MB more memory), change segmentation, and need a new Japanese pack. Instead, its judgement is
carried over to the entries IPADIC already has.

**Word costs** (`data/ipadic-costs.tsv`, 11,324 entries, applied when the tokenizer loads):
`scripts/data/buildJapaneseCosts.ts` builds the table from the plus dictionary's `sys.dic`.

- The reading the plus dictionary prefers for a word may get cheaper and its other readings dearer,
  never the reverse: 日本 にほん, 後 あと, 大勢 おおぜい, 緑色 みどりいろ, 金 かね over the surname キム.
- Whole words IPADIC has but the lattice split now win: 日本酒, 一日中, 十六夜.
- Readings the plus dictionary dropped cost more: 夜中 やちゅう, the prefix 今 こん, 剥がす へがす.

Function words, kana words, suffixes, numerals, numeral + counter words and one-kanji country names
keep IPADIC's costs. The plus dictionary segments those its own way, and copying them split として,
なんか and 何で, or read 現代人 as げんだいにん. Entries are matched by surface, part of speech and
reading, so another IPADIC build only skips lines.

**Readings pass** (`src/japanese/readings.rs`, after the lattice):

- *Numbers*: a number written in several kanji is one word read as a whole (二十 にじゅう, 三百
  さんびゃく, 二〇二六 にせんにじゅうろく), as the tokenizer guidelines ask (do not split 五百).
- *Counters*: numeral and counter stay two learner units (三 / 人), each with its sound change: 一本
  いっ・ぽん, 三本 さん・ぼん, 六本 ろっ・ぽん, 十個 じゅっ・こ, 三階 さん・がい, 一か月 いっ・かげつ, 十ページ
  じゅっ・ぺーじ, 四分 よん・ぷん. Native counts get native readings: 一人 ひと・り, 二人 ふた・り, 四人
  よ・にん, 三日 みっ・か, 二十日 はつ・か, 四月 し・がつ, 九時 く・じ, 二十歳 はた・ち. A day after a month
  is a date (四月一日 ついたち), and 三分の一 is a fraction (ぶん). After Arabic digits only the counter
  changes (3本 ぼん), since digits carry no furigana.
- *Context*: 行った is おこなった after an object with を in its clause, いった otherwise. 何 is なん
  before の, と, だ, です, て or a counting noun (何文字), なに otherwise. A one-kanji country name standing
  alone before a particle is the plain noun (米から こめ), while 日米 keeps べい.

**Cost.** Loading takes about 20 ms more on the owner's PC: about 645 ms to 665 ms, JMdict scan
included. A warm batch of 3,185 lines takes about 160 ms before and after (155–166 ms over runs), since
words the rules don't touch pass through as they are. The table adds about 0.5 MB to each binary and
allocates nothing: it only changes costs the dictionary already holds.

Boundaries are unchanged or better on the tokenizer-eval gold, measured through headless
`analyze_text`. Dev goes from 97.20% to 97.24% F1 (exact lines 73.33% → 74.00%); test stays at 97.88%.

**Still wrong**, as in every analyzer measured: the readings only meaning decides (人気のない ひとけ, お茶と最中
もなか, 生物なので なまもの, サイン色紙 しきし, 今日の日本社会 こんにち, 辛すぎる from a curry). Also words IPADIC
lacks (令和, 着ぐるみ) and names (不知火, 兎田). On Mathesis's side a teacher can pin a reading the
dictionary allows.

Reproduce: `npx tsx --test tests/japaneseReadings.test.ts` (needs the addon:
`cargo build --release --manifest-path native/rust/Cargo.toml -p miteiru-node`), and
`npx tsx scripts/eval/jvsKana.ts <jvs_nonpara_kana.csv>` with the CSV from
https://github.com/CyberAgentAILab/jvs_nonpara_kana (commit 3c7f1cd).

## Extra lexicons

JMdict records are streamed one MTRPACK2 block at a time in Rust, using a small temporary table cache. Typed deserialization skips glosses and other unused fields instead of allocating a JSON value tree. The worker never receives a headword dump. When explicitly enabled, only missing, two-to-eight-character all-kanji noun headwords become AppDictionary lattice nodes (including nouns usable with `する`, `な` or `の`); expressions, particles, prefixes, suffixes, inflecting-only entries and kana-only terms are not blindly merged. The default skips headword candidate/trie construction. Other JMdict lemmas remain available for type-checked suffix validation. The pack's raw JSON development source is not loaded a second time; extra words and suffix validation require `jmdict.pack` beside the tokenizer files.

Costs order UserManual before UserAi before AppDictionary: respectively `-16000 - 2000×length`, `-8000 - 1000×length`, and `6000 - 300×length` (length capped at 32). These are competing nodes, not destructive string replacement. App and user entries have independent compact tries. Updating enabled user entries rebuilds only the user trie; the large base dictionary and JMdict stay loaded. JS caches the filtered entry array and serializes dictionary-sync/tokenize pairs, so overlapping analysis requests cannot apply another revision halfway through a line. User readings and meanings remain with `userDictionaryToken`. Exact JMdict AI entries are still skipped; disabled and suppressed entries do not reach Rust. Vietnamese remains on the fragmenting pre-pass; Chinese paths are unchanged here.

Concurrent subtitle requests with the same revision are coalesced into chunks of at most 128 lines / one MiB, with at most four chunks in flight. They share a read lock on the immutable base/JMdict; user revisions and pack changes take a write lock. Every chunk in one revision finishes before the next revision is applied. `japanese_tokenize_batch` returns UTF-8 JSON bytes with a shared POS/conjugation table and compact word tuples, transferred through the renderer to the worker as an ArrayBuffer. The worker restores ordinary token objects with every original field. A shared Rust/JS fixture checks known, unknown and extra words, including absent readings. A fast Rust lattice plus one IPC round-trip per line was substantially slower than the old whole application pipeline. End-to-end measurements include this batching, not just an isolated Rust microbenchmark. Single-line requests remain ordinary `japanese_tokenize` calls. Release profiles optimize the tokenizer and JSON parser/serializer for speed while retaining the app's size-optimized default.

## Optional JMdict headword nodes

Set `tokenizer.japanese.useJmdictWords` to `true` and restart to enable the experimental AppDictionary nodes. Its default is `false`. On dev, the app-only lattice adds 0.18 F1 points and one exact line; adding app nodes to the suffix pipeline adds 0.19 points and two exact lines. The 30-line implementation-agent review found 28 better, 2 neutral, 0 worse. This small gain does not justify the measured first-load and memory cost by default. Suffix validation and Your dictionary remain active with the flag off.

## Compare Rust tokenizer modes

```powershell
$env:CARGO_TARGET_DIR='C:/Users/miki/miteiru/src-tauri/target'
npm.cmd ci
cargo build --release --manifest-path native/rust/Cargo.toml -p miteiru-tokenizer --example japanese_tokenize
npx.cmd tsx scripts/compareJapaneseTokenizers.ts --dict <ipadic-directory> --jmdict <existing-jmdict.pack-or-json>
```

The report uses 505 individually authored subtitle lines plus Japanese strings from repository tests and JSON fixtures. The gold fixture directory is explicitly excluded. JSON outputs contain every raw token field, changed lines, separate base/app/suffix/suffix_app/user predictions, throughput and retained dictionary bytes. The `--dict` argument defaults to the downloaded Japanese pack at `renderer/public/language-assets/japanese/dict`. Retained Rust allocation estimates are not RSS or JS heap and must not be mislabeled. End-to-end timings and worker heap are measured separately in the app.

For gold scoring, pass `--gold tests/fixtures/tokenizer-eval/ja.dev.jsonl --out dist/tokenizer-ja-dev`; tune only that split. After freezing the implementation, run the same command on `ja.test.jsonl` into a separate directory and use `scripts/evalTokenizers.ts` on each `{id,tokens}` predictions JSONL. Predictions are learner surfaces after the actual `parseJapaneseVerbs` pipeline, not raw lattice nodes. The final no-user result is `suffix` (app nodes off); `suffix_app` is its explicit app-node ablation. Artificial user entries are reported separately and never used as the final no-user gold result.

Evaluation results and the reviewed changed-line sample are in [JAPANESE_TOKENIZER_EVALUATION.md](JAPANESE_TOKENIZER_EVALUATION.md) and the PR.
