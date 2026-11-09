# Native Mandarin and Cantonese tokenization

Miteiru owns the decoder and scoring in `miteiru-tokenizer::chinese`. The only production dependency is cedarwood 0.4, an efficiently updatable double-array trie. `jieba-rs` 0.8.1 is an exact-version **dev dependency**, used only as a comparison engine. No dictionary, corpus, or neural model is downloaded.

## Method and research

A unigram maximum-probability word lattice and jieba's DAG maximum-probability route optimize the same objective: the sum of token log probabilities. Renaming a DAG to a lattice does not improve accuracy. The important differences here are candidate coverage, frequency calibration, OOV policy, and avoiding repeated work. Miteiru enumerates trie prefixes directly while solving the route, stores precomputed negative log probabilities, borrows token slices, and never constructs a second DAG or re-looks up each edge. The base trie, app trie, and user trie compete in one context-preserving route.

Research considered:

- [Kudo, ACL 2018, unigram language-model segmentation](https://aclanthology.org/P18-1007/): globally scored alternatives, rather than greedy longest matching. This paper concerns subwords for translation, not evidence that its training recipe is the best Chinese word segmenter.
- [jieba-rs maintainer's performance study](https://messense.me/making-jieba-rs-2-4x-faster): avoid regex, logarithms, string-keyed lookups, and unnecessary allocation in hot paths. The comparison deliberately pins the app's old 0.8.1, not the faster current release.
- [PyCantonese's documented segmenter](https://docs.pycantonese.org/stable/word_segmentation.html): its current hybrid uses Cantonese-specific training data. A Mandarin HMM is not a Cantonese model. Those external dictionaries/corpora/models were **not downloaded**.
- [Lam, Lau and Lee, 2024, Multi-Tiered Cantonese Word Segmentation](https://aclanthology.org/2024.lrec-main.1047/): Cantonese has competing legitimate segmentation conventions. Miteiru's target is dictionary-look-up-able learning units, not an unsupported claim of universal linguistic word boundaries.
- [cedarwood 0.4.6](https://docs.rs/cedarwood/0.4.6/cedarwood/): a data structure only; no segmentation or language model logic comes from it.

### OOV alternatives

Jieba's BMES HMM can invent useful names, but also joins pronouns, classifiers and Cantonese particles into tokens without a dictionary entry. A lexicon-trained BMES model or character-bigram model would have no real inter-word observations: a bag of dictionary headwords is not a segmented sentence corpus. Neural/CRF/transformer segmenters need weights and training data that the app does not ship. It would be misleading to label an unvalidated pseudo-trained model "state of the art".

The constrained choice is typed OOV backoff: preserve Latin/digit words, internal hyphens/apostrophes, handles, decimals, percentages, time labels, Chinese numeral runs and contiguous whitespace. Familiar names beginning with 阿/小/老 and names preceding recognizable titles get competing hypotheses. Their priors use the shipped `nr` tags and square-root-weighted name-character counts; this is a limited heuristic, not a general trained name recognizer. Other unknown Han falls back to singletons. App dictionary candidates and saved user words resolve known unknowns in the same lattice. The public `hmm` bridge argument is retained for compatibility; it enables typed OOV and name handling, not the removed jieba HMM.

Productive numeral/classifier, A-not-A and language-specific grammatical boundaries are filtered when lexicons are built. Cantonese has its own particle and colloquial-word exceptions, rather than inheriting Mandarin aspect rules. Context-independent filters cannot resolve every sense: a valid headword can still cross the intended word boundary. The authored corpus is tuning/stress material. Only gold dev was used for gold tuning. The source was frozen as Git blob `ec628aa9bfac82910350d785d6db94c6facc3fb2` before one final held-out scoring run; no held-out error cases were inspected and no later parameter changes were made.

## Frequencies and overlays

Base probabilities come from the pack's frequencies. Repeated words take the last frequency, as before. Counts are accumulated with overflow checking; malformed frequencies/NUL words are rejected. The route minimizes the sum of negative log probabilities and breaks exact ties toward the longer edge.

Missing app headwords have no corpus counts. Their pseudo-frequency is the count just sufficient to compete with the base segmentation of that headword, with a 1.5× odds margin, capped at the observed 90th-percentile base count for the same length bucket (one, two, three-or-more characters). These are data-informed priors, not observed counts for new words. The percentile and policy margins were selected on dev. The base total stays fixed, so adding words does not silently rescale every existing edge. App-only candidates ending in productive language-specific particles or forming recognizable productive phrases are conservatively withheld. Dictionary membership can restore ambiguous aspect-ending base entries, such as lexical 超過, but also admits wrong senses such as noun 穿着 in a verbal context; that limitation is visible in the review.

Saved AI and manual words use that same base-derived competition cost with 4× and 64× odds margins respectively; manual entries win more readily. These margins encode source priority, not fabricated frequency observations. Their readings and meanings remain outside Rust. All enabled, non-suppressed user words are replaced atomically in a separate light trie; the immutable base and app tries are shared by `Arc`. Disable/removal/revision changes therefore need no base reload. Invalid updates leave the old tokenizer intact. Mandarin/Cantonese pass the whole line through this route, then exact saved-word tokens use `userDictionaryToken`; Vietnamese retains its fragmenting pre-pass.

## Runtime headwords

Pack files and their sha256 hashes are untouched. `sys::table::chinese_headwords` reads only blocks intersecting `indexes/` through `indexes0`. It enumerates simplified and traditional keys, strips the exact referenced storage id, and deduplicates headwords. It does not parse dictionary entry JSON, load the substring index, or fill the lookup block cache. Decoded blocks are discarded one at a time. Development's JSON fallback deserializes only `words[].content` and `words[].simplified`, not character records.

Mandarin uses CC-CEDICT; Cantonese uses CantoDict. Cross-language CEDICT augmentation for Cantonese must be justified by a separate dev ablation before being enabled.

## Reproduce

`npx tsx scripts/compareChineseTokenizer.ts <existing language-assets> <scratch output>` builds an optimized comparison binary under the required shared target directory. It reports base load time, retained/peak requested heap bytes (a counting allocator, not RSS), warm throughput, both HMM settings for jieba, dictionary token share, Han character coverage, changed-line share, and JSONL predictions. Each engine runs in a fresh process. Prediction generation is outside the timed throughput loop; both engines use the same allocator instrumentation and corpus. Repeat measurements on an idle machine before comparing small differences.

There are **500 distinct authored Mandarin sentences and 500 Cantonese sentences**, covering casual dialogue, names, numbers, computing, travel, food, punctuation and mixed Latin/emoji. Traditional Mandarin is converted with the repo's existing OpenCC dependency; Cantonese naturally rewrites many of the same scenarios. These are not 1,500 independent annotations. Fourteen existing test/fixture snippets are added to each variant, including intentionally cross-language snippets. Gold fixtures are explicitly excluded from the collector. These sentences are stress/comparison material, not a gold accuracy benchmark.

Passing the gold fixture directory as the third argument uses **dev files only**. Test predictions are generated separately after parameters are frozen and scored with the gold branch's `scripts/evalTokenizers.ts`. Do not tune from the final test report or silently update the gold.

Standalone predictions, after preparing headwords with the comparison script (use `yue` and the Cantonese paths for Cantonese):

```powershell
$env:CARGO_TARGET_DIR='C:/Users/miki/miteiru/src-tauri/target'
$assets='C:/Users/miki/miteiru/renderer/public/language-assets' # Existing local assets.
$output=Join-Path $env:TEMP 'miteiru-chinese-review'
npx.cmd tsx scripts/compareChineseTokenizer.ts $assets $output
cargo run --release --manifest-path native/rust/Cargo.toml -p miteiru-tokenizer --example chinese_eval -- native zh "$assets/mandarin/chinese/zh.jieba.txt" "$output/zh-Hans.headwords.txt" tests/fixtures/tokenizer-eval/zh-Hans.dev.jsonl "$output/zh-Hans.native.dev.jsonl" true
npx.cmd tsx scripts/evalTokenizers.ts --predictions "$output/zh-Hans.native.dev.jsonl" --variant zh-Hans --split dev
```

The example accepts `{id,text}` JSONL, ignores additional fields, writes `{id,tokens}` JSONL and asserts exact reconstruction. Set the headwords argument to `-` for the native base, or engine to `jieba` for the pinned Rust reference. `true`/`false` selects the legacy HMM flag (typed/name OOV for native). JS pinyin/jyutping generation preserves these token surfaces; the Node fallback still uses its installed native jieba package, so the committed Node baseline and pinned Rust baseline are reported separately.

## Evidence and review status

See [the evaluation report](chinese-tokenizer-evaluation.md), [the reviewed differences](chinese-tokenizer-review.md) and [machine-readable evidence](../tests/fixtures/chinese-tokenizer/evidence.json). The difference judgments are by the implementation agent with the candidates visible, not a blind independent judge or a human evaluation. The gold is independently annotated/adjudicated LLM data, not human-validated accuracy.

The combined change is a **draft**. Warm throughput and aggregate held-out accuracy improve, but the reviewed app-overlay sample has too many wrong-sense/productive-phrase merges to satisfy the owner's near-zero-worse acceptance rule. The sample was completed after the model freeze; it is reported without post-test tuning. Further work must use dev evidence and disclose the already-observed test aggregates.

The scratch CDP helper `scripts/chineseTokenizerCdp.mjs` connects to an already launched isolated test app. Always set `MITEIRU_USER_DATA_DIR` to a new scratch profile and `MITEIRU_MUTED=1`; use a scratch Tauri `--config` for `additionalBrowserArgs`. Keep `frontendDist` relative (`../app`): an absolute Windows drive path can be parsed as a URL. Stop only the PIDs launched for the test. Never use the real profile or an installer.
