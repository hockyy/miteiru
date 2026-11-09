# Mandarin and Cantonese tokenizer evaluation

Measured on Windows (Intel Core Ultra 7 265K, Rust 1.91.1, Node 22.23.3) on 2026-11-09, based on main `165d16f`. Production model Git blob: `ec628aa9bfac82910350d785d6db94c6facc3fb2`. Gold dev was used for tuning; test was scored once per final engine after freezing the model, with `--worst 0`. No held-out error cases were inspected. This report does not claim human-validated accuracy. The [method](chinese-tokenizer.md), [qualitative review](chinese-tokenizer-review.md) and [raw aggregate evidence](../tests/fixtures/chinese-tokenizer/evidence.json), including source dictionary/list hashes, give the scope and limitations.

## Gold: base and dictionary effects separately

Each split has 150 lines per variant. F1 counts internal Unicode-code-point boundaries, including punctuation/whitespace; exact is whole-line token equality. User words are absent from all gold runs. The official baseline is the committed Node jieba + app token-building runner. Its package behavior is not byte-identical to the pinned Rust jieba-rs 0.8.1 comparison; both are shown explicitly.

| Variant | Official Node dev F1 / exact | Native base dev F1 / exact | Native + app dev F1 / exact |
| --- | ---: | ---: | ---: |
| zh-Hans | 93.10% / 29.33% | 95.69% / 50.67% | 95.70% / 54.00% |
| zh-Hant | 93.33% / 34.67% | 95.67% / 48.00% | 95.90% / 52.67% |
| yue | 94.65% / 44.67% | 97.89% / 72.00% | 98.09% / 74.67% |

| Variant | Official Node test F1 / exact | Native base test F1 / exact | Native + app test F1 / exact | App test P / R |
| --- | ---: | ---: | ---: | ---: |
| zh-Hans | 93.05% / 34.00% | 95.32% / 47.33% | 95.30% / 48.67% | 98.59% / 92.22% |
| zh-Hant | 92.66% / 25.33% | 94.68% / 41.33% | 94.98% / 42.67% | 97.97% / 92.17% |
| yue | 94.15% / 34.67% | 96.88% / 58.00% | 96.90% / 58.67% | 97.74% / 96.07% |

The app dictionary overlay improves all three dev F1/exact pairs. On test it changes F1 by −0.02 points for simplified Mandarin, +0.30 for traditional and +0.02 for Cantonese; exact match improves in each. Do not generalize these small deltas beyond this deliberately difficult, LLM-annotated sample.

| Variant | Raw Rust jieba HMM dev F1 / exact | Raw Rust jieba HMM test F1 / exact |
| --- | ---: | ---: |
| zh-Hans | 91.39% / 21.33% | 90.82% / 22.67% |
| zh-Hant | 91.43% / 20.00% | 90.42% / 12.67% |
| yue | 91.36% / 19.33% | 91.06% / 20.00% |

## Speed, build time and memory

Optimized Rust example, one fresh process per engine/variant, same preloaded word-list bytes, same authored corpus and allocator instrumentation. Parse/build excludes file I/O. Overlay timing includes reading a prepared headword text file and building its trie; the live app measurement below instead includes actual MTRPACK2 enumeration. Throughput is a warm loop of at least 800 ms, UTF-8 MiB/s; allocation tracking is disabled before that loop. These are single local measurements, not confidence intervals.

| Variant | Engine | Base parse/build ms | App overlay ms | Warm MiB/s |
| --- | --- | ---: | ---: | ---: |
| zh-Hans | jieba HMM | 120.30 | — | 25.87 |
| zh-Hans | jieba no HMM | 114.06 | — | 34.90 |
| zh-Hans | native base | 162.75 | — | 36.46 |
| zh-Hans | native + app | 160.66 | 57.24 | 28.55 |
| zh-Hant | jieba HMM | 116.15 | — | 25.47 |
| zh-Hant | jieba no HMM | 122.38 | — | 34.71 |
| zh-Hant | native base | 165.26 | — | 34.88 |
| zh-Hant | native + app | 165.35 | 60.84 | 27.76 |
| yue | jieba HMM | 7.73 | — | 21.34 |
| yue | jieba no HMM | 8.40 | — | 36.23 |
| yue | native base | 9.64 | — | 40.34 |
| yue | native + app | 9.70 | 28.32 | 32.53 |

The full app model is 1.10× / 1.09× / 1.52× faster than pinned jieba HMM for Hans/Hant/yue in this run. It is slower than jieba **without** HMM. Base parse/build is slower than old jieba, and the app trie adds startup work.

Memory is requested **heap bytes**, not process RSS or system-allocator arena overhead. The allocator subtracts the already-loaded input/corpus. Peak below is base construction only; retained app memory includes both immutable layers. Chinese script variants share the same base data.

| Language | jieba retained / base peak MiB | Native base retained / base peak MiB | Native + app retained MiB | App retained increment MiB |
| --- | ---: | ---: | ---: | ---: |
| Mandarin | 73.07 / 89.00 | 49.48 / 73.60 | 55.01 | 5.54 |
| Cantonese | 4.55 / 5.30 | 3.09 / 4.89 | 6.11 | 3.02 |

Mandarin uses less retained heap than old jieba even with the app overlay. Cantonese's much larger runtime headword overlay raises retained heap above old jieba. No CEDICT augmentation is enabled for Cantonese; no cross-language ablation is claimed.

## Authored-corpus dictionary coverage

500 authored Mandarin lines, their OpenCC traditional conversions, 500 Cantonese rewrites, plus 14 existing repo fixture lines for each variant. This is stress/tuning material, not independent gold. Multi-character share counts tokens with at least one Han character and at least two Unicode characters that exactly match a dictionary headword. Character coverage counts Han characters inside such matching tokens divided by all Han characters.

| Variant | Engine | Dictionary share of multi-character Han-containing tokens | Han characters covered by multi-character dictionary words |
| --- | --- | ---: | ---: |
| zh-Hans | jieba | 81.14% | 59.59% |
| zh-Hans | base | 88.66% | 56.14% |
| zh-Hans | app | 88.79% | 57.12% |
| zh-Hant | jieba | 78.48% | 58.40% |
| zh-Hant | base | 86.15% | 55.03% |
| zh-Hant | app | 86.33% | 56.11% |
| yue | jieba | 77.38% | 51.11% |
| yue | base | 96.81% | 44.22% |
| yue | app | 97.13% | 48.85% |

The overlay improves character coverage over the native base. Correct splitting of grammatical/count phrases lowers character coverage versus HMM, so coverage alone is not an accuracy objective. The qualitative sample also shows that dictionary membership alone cannot identify the contextual sense.

| Variant | jieba HMM → native base changed | Native base → app changed | jieba HMM → native + app changed |
| --- | ---: | ---: | ---: |
| zh-Hans | 245/514 (47.67%) | 40/514 (7.78%) | 252/514 (49.03%) |
| zh-Hant | 253/514 (49.22%) | 42/514 (8.17%) | 259/514 (50.39%) |
| yue | 359/514 (69.84%) | 125/514 (24.32%) | 362/514 (70.43%) |

Runtime app candidates: Mandarin 50,932 added + 156 lexical restorations, 7,163 filtered; Cantonese 41,723 + 21 restorations, 2,773 filtered. These differ from raw missing-headword counts because only Han candidates passing the grammar filters are admitted.

## Qualitative acceptance

[140 reviewed changes](chinese-tokenizer-review.md): 40 Mandarin and 40 Cantonese full comparisons, plus 30 per language for app-overlay effects. This is non-blind implementation-agent review, not the optional independent randomized LLM judge procedure.

| Comparison | Language | Better / worse / neutral |
| --- | --- | ---: |
| jieba HMM → native + app | Mandarin | 37 / 2 / 1 |
| jieba HMM → native + app | yue | 35 / 4 / 1 |
| base → app | Mandarin | 21 / 6 / 3 |
| base → app | yue | 15 / 11 / 4 |

**The near-zero-worse acceptance requirement is not met.** The overlay still admits wrong senses (Cantonese 個字 = five minutes used for classifier + character), cross-boundary phrases (有風筒 → 有風 / 筒), and productive count phrases (三個月). Mandarin can restore noun 穿着 in verbal-aspect context, or choose metropolis 都會 for 都 / 會. The frozen model is left unchanged after held-out scoring. Keep this PR draft until those failures are addressed with dev-only evidence.

## Final packaged-app live check

Built the frozen model in Tauri with a scratch `--config`, CDP on 9228, `MITEIRU_MUTED=1` and a scratch `MITEIRU_USER_DATA_DIR`. Installed already-built local Hanzi/Mandarin/Cantonese release packs into that profile; no download or real-profile access. Loaded self-written Mandarin/Cantonese `.srt` files through native drag/drop, selected each as primary subtitles, and inspected their visible tokens and word popups over CDP and screenshots.

| First language invocation | Packaged jieba baseline ms | Final native + app ms |
| --- | ---: | ---: |
| Mandarin | 195.0 | 318.8 |
| Cantonese | 38.6 | 90.8 |

These are first language loads in separate fresh scratch profiles, not disk-cold boot measurements. They include the worker/bridge, gzipped asset reading, tokenizer, MTRPACK2 dictionary setup and runtime headword enumeration. Startup is slower despite higher warm segmentation throughput.

An additional three-pair warm-asset measurement called the native load command directly with/without `dictionaryPath`, rebuilding the same isolated benchmark key each time. Median base → base+pack-headwords load: Mandarin 184.8 → 283.6 ms (+98.8 ms), Cantonese 12.1 → 59.7 ms (+47.6 ms). This isolates the combined MTRPACK2 enumeration and app-trie overhead more closely than first-language UI timings; it is not a pure disk-read or pure enumeration benchmark.

Mandarin displayed `我 / 想 / 喝 / 冰咖啡 / 。`, and the popup showed iced coffee with its pinyin. Cantonese displayed `我 / 想 / 飲 / 凍啡 / 。`, with jyutping and the same meaning. Through the real Your-dictionary form, saving manual `喝冰咖啡` (`he1 bing1 ka1 fei1`) or `飲凍啡` (`jam2 dung3 fe1`) changed the visible line to one saved token in 58.2 / 52.2 ms. Its reading, `manual iced coffee test` meaning and manual source survived token building and appeared in the popup. Removing the entry reverted the visible line in 51.7 / 51.8 ms. `performance.timeOrigin` stayed unchanged throughout both save/remove cycles, proving no page reload. Timings use 50 ms polling and are approximate upper bounds.

[Live evidence](../tests/fixtures/chinese-tokenizer/live-evidence.json) retains token arrays, revisions and timing assertions. Screenshots and CDP drivers remain in the temporary scratch folder. Only captured test PIDs are stopped. The existing shared custom-Chinese popup labels the Mandarin saved-reading chip “Jyutping”; this pre-existing presentation quirk is disclosed and no UI is changed.

## Automated checks

All use Windows npm.cmd/npx.cmd equivalents. Every Cargo invocation used `CARGO_TARGET_DIR=C:/Users/miki/miteiru/src-tauri/target`.

```text
npm run lint:smells                 no issues
npm test                           1068 passed, 0 failed
npx tsc -p renderer --noEmit        exit 0, no diagnostics
npx tsc --noEmit                    exit 0, no diagnostics
node scripts/buildBackendWorker.mjs exit 0, 3.9 MB worker
cargo test (native/rust)            passed, tokenizer 14/14
cargo test (src-tauri)              83 passed, 4 ignored, 0 failed
Tauri release build                passed
Gold scorer                        all 18 final engine/split/variant runs valid
```

Existing tests remain unchanged; three integration tests cover complete-line segmentation, revision/disable/suppression updates, and saved reading/meaning presentation. Native tests cover scoring, typed/name OOV, source priority, atomic reversible user overlays, packed headword enumeration and gzipped lists. See the method document for reproduction commands.
