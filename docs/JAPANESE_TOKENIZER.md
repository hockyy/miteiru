# Japanese tokenizer

Miteiru owns the tokenizer logic in `native/rust/crates/miteiru-tokenizer/src/japanese*`. No new dictionary or corpus is downloaded. The worker defaults to the Rust commands `japanese_load`, `japanese_set_words`, `japanese_tokenize` and `japanese_tokenize_batch`. The installed Japanese pack supplies the same IPADIC files and JMdict MTRPACK2 table as before. JMdict validates suffix bases by default; its headword-node layer is an explicit opt-in. There is no pack-format or UI change.

## Design and research

This is an engineering choice for our shipped resources, not a claim of universal state-of-the-art accuracy. A MeCab-style minimum-cost lattice is the strongest practical foundation here: IPADIC already supplies lexical costs, context IDs and a trained transition matrix. A different segmentation model would need training data or dictionaries we do not ship.

- [Vibrato](https://github.com/daac-tools/vibrato) and its [compact lattice](https://github.com/daac-tools/vibrato/blob/main/vibrato/src/tokenizer/lattice.rs) motivate contiguous nodes, integer predecessors and locality in transition lookups. Our connection matrix is transposed once so predecessor-right IDs for one candidate-left ID lie in a contiguous row. IPADIC's approximately 3.3 MiB matrix does not justify Vibrato's more complex large-matrix ID remapping. We implement the existing byte double-array format directly: no new trie dependency, conversion, string slicing or feature parsing in the hot lookup loop.
- [Sudachi's splitting and normalization](https://github.com/WorksApplications/Sudachi) motivate distinguishing morphological tokens from learner units and retaining original offsets through normalization. We cannot reproduce Sudachi's A/B/C dictionaries without their split metadata. Instead, conservative JMdict noun compounds compete as lattice nodes; typed suffix paths create learner units. Only half-width katakana (including paired voicing marks) and full-width ASCII get normalized lookup alternatives, at a small penalty. Original surfaces are never rewritten. Broad NFKC, lowercasing, speculative spelling repair and indiscriminate expression merging are deliberately excluded.
- [MeCab unknown-word definitions](https://taku910.github.io/mecab/unk.html) motivate keeping the shipped character categories, invocation and grouping rules. We precompute unknown run ends, count Unicode scalars rather than UTF-16 code units, and retain all punctuation, spaces and emoji. Bounded shape alternatives keep mixed Latin labels (`Wi-Fi`, `USB-C`, handles, alphanumerics), decimal/percentage/time numerals and uninterrupted kanji numerals together without absorbing neighboring Japanese. NUL cannot become a double-array terminal inside an input word. Unknown readings remain absent unless a validated suffix chain can retain the known head reading plus literal kana.
- The owner's `miteiru-ios/core/src/deinflect.rs` supplies the from-scratch typed ending-rewrite approach. Our bounded, suffix-indexed rewrite search checks word-type conditions and actual JMdict lemmas before composing a learner unit. It handles te auxiliaries, desire, excess, adjective nominalization, colloquial contractions and honorific helpers. It can repair a non-JMdict inflected base only when a typed rewrite reaches a real JMdict lemma. It does not join arbitrary hiragana strings, cross punctuation, or consume a user-defined word. Existing `parseJapaneseVerbs` still runs, with a native-only learner-boundary option that leaves discourse particles and modality separate. `らしい`, `っす`, `じゃん`, `っけ`, explanatory `んだ` and quotation `って` are recognized but not indiscriminately attached to content words: the published gold guidelines explicitly prefer separate learner clicks. The fallback retains the legacy parser behavior.

The loader trims kuromoji's unused zero-filled buffers; features are decoded only for the winning path. It validates map bounds, context IDs, matrix dimensions and character definitions. `flate2` was already used by Tauri; `unicode-normalization` supplies standard Unicode tables, not tokenizer logic. Extra tries are built directly from sorted prefix ranges into flat 32-bit node/edge indexes, without a temporary tree allocation per node. The lemma map retains just boxed surfaces and type bits, not every JMdict reading twice.

All token-object fields remain available: surface, POS/details, conjugation type/form, dictionary base, reading and pronunciation. Known morphology keeps IPADIC metadata; a composed learner unit keeps the head's type, final inflection form and the concatenated surface readings. Dictionary words use their JMdict reading; the caller supplies user readings/meanings. Positions are one-based Unicode scalar offsets in the original text, and IDs are opaque (negative for extra words). The repair pass cannot split an inflected auxiliary such as `ちゃわ` in `忘れちゃわない`. Honorific composition excludes lexical suru nouns such as `おかわり`; nominal copulas remain separate from their nouns.

## Extra lexicons

JMdict records are streamed one MTRPACK2 block at a time in Rust, using a small temporary table cache. Typed deserialization skips glosses and other unused fields instead of allocating a JSON value tree. The worker never receives a headword dump. When explicitly enabled, only missing, two-to-eight-character all-kanji noun headwords become AppDictionary lattice nodes (including nouns usable with `する`, `な` or `の`); expressions, particles, prefixes, suffixes, inflecting-only entries and kana-only terms are not blindly merged. The default skips headword candidate/trie construction. Other JMdict lemmas remain available for type-checked suffix validation. The pack's raw JSON development source is not loaded a second time; extra words and suffix validation require `jmdict.pack` beside the tokenizer files.

Costs order UserManual before UserAi before AppDictionary: respectively `-16000 - 2000×length`, `-8000 - 1000×length`, and `6000 - 300×length` (length capped at 32). These are competing nodes, not destructive string replacement. App and user entries have independent compact tries. Updating enabled user entries rebuilds only the user trie; the large base dictionary and JMdict stay loaded. JS caches the filtered entry array and serializes dictionary-sync/tokenize pairs, so overlapping analysis requests cannot apply another revision halfway through a line. User readings and meanings remain with `userDictionaryToken`. Exact JMdict AI entries are still skipped; disabled and suppressed entries do not reach Rust. Vietnamese remains on the fragmenting pre-pass; Chinese paths are unchanged here.

Concurrent subtitle requests with the same revision are coalesced into chunks of at most 128 lines / one MiB, with at most four chunks in flight. They share a read lock on the immutable base/JMdict; user revisions and pack changes take a write lock. Every chunk in one revision finishes before the next revision is applied. `japanese_tokenize_batch` returns UTF-8 JSON bytes with a shared POS/conjugation table and compact word tuples, transferred through the renderer to the worker as an ArrayBuffer. The worker restores ordinary token objects with every original field. A shared Rust/JS fixture checks known, unknown and extra words, including absent readings. A fast Rust lattice plus one IPC round-trip per line was substantially slower than the old whole application pipeline. End-to-end measurements include this batching, not just an isolated Rust microbenchmark. Single-line requests remain ordinary `japanese_tokenize` calls. Release profiles optimize the tokenizer and JSON parser/serializer for speed while retaining the app's size-optimized default.

## Optional JMdict headword nodes

Set `tokenizer.japanese.useJmdictWords` to `true` and restart to enable the experimental AppDictionary nodes. Its default is `false`. On dev, the app-only lattice adds 0.18 F1 points and one exact line; adding app nodes to the suffix pipeline adds 0.19 points and two exact lines. The 30-line implementation-agent review found 28 better, 2 neutral, 0 worse. This small gain does not justify the measured first-load and memory cost by default. Suffix validation and Your dictionary remain active with the flag off.

## One-release fallback

Set `tokenizer.japanese.useKuromoji` to `true` in the app store, then restart the app. The default is `false`. For example, through the existing renderer bridge:

```js
await window.miteiruStore.set('tokenizer.japanese.useKuromoji', true)
```

The fallback lazily initializes kuromoji.js and its legacy dictionary loader; it is not silently activated after a Rust error. It also retains the old user-word pre-pass. Reset the key to `false` and restart to return to Rust. Keep the IPADIC assets: they are still the Rust tokenizer's base dictionary. Apache/IPADIC reference notices ship under `licenses/`.

## Reproduce the comparison

```powershell
$env:CARGO_TARGET_DIR='C:/Users/miki/miteiru/src-tauri/target'
npm.cmd ci
cargo build --release --manifest-path native/rust/Cargo.toml -p miteiru-tokenizer --example japanese_tokenize
node --expose-gc --import tsx scripts/compareJapaneseTokenizers.ts --jmdict <existing-jmdict.pack-or-json>
```

The report uses 505 individually authored subtitle lines plus Japanese strings from repository tests and JSON fixtures. The gold fixture directory is explicitly excluded. JSON outputs contain every raw token field, per-field differences, all changed lines, independent base/app/suffix/suffix_app/user predictions, throughput, retained dictionary bytes and baseline JS heap/backing-store deltas. Baseline crashes are reported, not silently removed. Retained Rust allocation estimates are not RSS or JS heap and must not be mislabeled. End-to-end timings and worker heap are measured separately in the app.

For gold scoring, pass `--gold tests/fixtures/tokenizer-eval/ja.dev.jsonl --out dist/tokenizer-ja-dev`; tune only that split. After freezing the implementation, run the same command on `ja.test.jsonl` into a separate directory and use `scripts/evalTokenizers.ts` on each `{id,tokens}` predictions JSONL. Predictions are learner surfaces after the actual `parseJapaneseVerbs` pipeline, not raw lattice nodes. The final no-user result is `suffix` (app nodes off); `suffix_app` is its explicit app-node ablation. Artificial user entries are reported separately and never used as the final no-user gold result.

Evaluation results and the reviewed changed-line sample are in [JAPANESE_TOKENIZER_EVALUATION.md](JAPANESE_TOKENIZER_EVALUATION.md) and the PR.
