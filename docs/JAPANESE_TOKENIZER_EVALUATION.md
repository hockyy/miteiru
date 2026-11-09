# Japanese tokenizer evaluation

Implementation frozen at `40214d141412ce2719489ff2a8ffa3a9c5657d27`, rebased onto `a2bbea0` (Chinese tokenizer PR #198). Gold is main commit `165d16f` (PR #197). Only ja.dev was used for tuning. The test split was scored once after freezing; later changes are reporting only. Predictions include the real processKuromojinToSeparations and parseJapaneseVerbs pipeline. JMdict headword nodes are off by default; suffix validation and Your dictionary are on. No artificial user entries contribute to the final gold scores.

## Gold results

| Split / pipeline | Boundary F1 | Exact lines |
| --- | ---: | ---: |
| dev kuromoji | 93.66% | 48.00% |
| dev default native | 97.20% | 73.33% |
| test kuromoji | 94.50% | 48.00% |
| test default native | 97.79% | 75.33% |

| Dev configuration | Boundary F1 | Exact lines |
| --- | ---: | ---: |
| Own IPADIC + learner-boundary parser | 95.17% | 60.00% |
| + suffix layer (default) | 97.20% | 73.33% |
| IPADIC + app nodes, suffix off | 95.35% | 60.67% |
| Suffix layer + app nodes (opt-in) | 97.38% | 74.67% |

The suffix layer adds 2.03 F1 points and 13.33 exact-line percentage points over the base lattice/parser on dev: 29 improved lines, zero lower-F1 lines. Overall, 52 dev lines improve over kuromoji and none have lower per-line boundary F1. Each split has 150 deliberately difficult, independently LLM-annotated/adjudicated lines; this is not a population accuracy estimate or human-validated gold.

## JMdict headword decision

App nodes alone add 0.18 dev F1 points and one exact line over the base. Adding them to the suffix pipeline adds 0.19 points and two exact lines; all four changed dev lines improve. The 30-line implementation-agent review found 28 better, 2 neutral, 0 worse. This modest gain does not justify shipping them by default.

The separate app-node index costs 52.1 ms extra in the release example (83.9 → 136.0 ms; JSON/pack reading excluded from this index-only measurement). Retained owned-allocation estimates rise from 82.95 to 96.97 MB. In the same release-like app binary, first-subtitle samples were 640.2 ms with nodes off and 804.7 ms on. These single cold-process samples are noisy; raw timings are retained.

Set `tokenizer.japanese.useJmdictWords = true` and restart for the opt-in ablation. The default skips candidate/trie construction while retaining JMdict lemma/type validation for suffixes. Missing, 2–8-character all-kanji nouns are eligible; counted expressions, particles and arbitrary dictionary phrases are excluded.

## Corpus comparison and lookup coverage

505 individually authored subtitle-style lines are in tests/fixtures/japanese-subtitles.txt. The full harness adds Japanese-script test/fixture strings, including Han-only cross-language cases, for 4402 total lines. The gold directory and tokenizerEval.test.ts are excluded.

Default versus kuromoji: 385/505 authored lines differ in raw objects (76.24%); 132/505 differ in learner boundaries (26.14%). On the full corpus: 2498/4402 raw (56.75%) and 733/4402 learner (16.65%). The harness records every field difference, not an output-parity gate. All native raw and learner outputs reconstruct the input exactly. Kuromoji crashes on one repository-internal NUL-containing user-key fixture; that failure is retained in the report.

App-only nodes change 42 authored lines / 53 full-corpus lines; artificial user nodes change 2 / 3. Coverage accepts an exact JMdict surface or basic-form headword. All-token denominators include punctuation, spaces, numerals and Latin labels; Japanese-script denominators are separate. Dictionary membership is not contextual correctness, and merging several indexed pieces can lower hit share.

| Authored corpus configuration | All-token JMdict hit share | Japanese-script-token hit share |
| --- | ---: | ---: |
| kuromoji | 74.93% | 98.33% |
| Own base | 75.97% | 98.61% |
| App-node ablation | 75.65% | 98.59% |
| Default suffix pipeline | 75.62% | 98.72% |
| Suffix + app opt-in | 75.29% | 98.70% |
| Artificial user entries | 75.58% | 98.68% |

Standalone release tokenizer throughput on authored lines: kuromoji 17.77 ms, Rust base 5.15 ms, default Rust suffix 10.84 ms (1.64× faster including suffix work; excludes IPC/JS presentation). Full-corpus times: 59.22 vs 41.46 ms. These are separate from the end-to-end app measurements.

## Release-like live measurements

Windows, one embedded-frontend release binary, scratch tauri --config enabling CDP 9229, MITEIRU_MUTED=1 and isolated MITEIRU_USER_DATA_DIR profiles. Both variants use the same installed Japanese pack. Time starts immediately before loadKuromoji and ends after the first analyzeText result; pack extraction is outside the timer. Warm throughput uses concurrent backend.invoke(analyzeText, line) calls and includes both IPC crossings, decoding, furigana/separation building, verb grouping and results back to the renderer. Five warmups and seven recorded trials are used for the steady comparison.

| Release-like app measurement | kuromoji fallback | Default Rust |
| --- | ---: | ---: |
| Load Japanese → first tokenized subtitle | 876.5 ms | 640.2 ms |
| First 505-line batch | 124.3 ms | 45.5 ms |
| Warm 505-line pipeline, median of 7 after 5 warmups | 90.3 ms | 35.5 ms |
| Worker JS heap after GC | 79.62 MB | 41.42 MB |
| Worker backing storage after GC | 98.10 MB | 4.13 MB |
| App + descendant processes, private memory | 497.80 MB | 468.65 MB |

The warm median is 2.54× faster. MB means decimal megabytes. Worker heap/backing measurements use CDP after explicit GC; total process memory is the sum of private bytes after the same initial warmup/batches and GC, not peak RSS. Startup numbers are single fresh-process samples with OS file caches warm. Runtime variability and all timing arrays are retained in JAPANESE_TOKENIZER_RESULTS.json.

The final build passed the authored .srt live check: a manual 新造固有語 immediately became one subtitle token; the popup showed Your entry, しんぞうこゆうご and scratch coined term. Removal restored exactly the original visible tokens. performance.timeOrigin stayed unchanged through add/remove. 食べさせていただきます displayed as one learner unit with base 食べる; normalized half-width loanwords retain their surfaces and lookup bases. The real app profile was untouched.

## Changed-line review

Reviewed by the implementation GPT-6.1 Sol agent against the guidelines, not an independent human reviewer. This 40-line sample is stratified across particles, numeric/Latin shapes, normalization, derivation and keigo, not a random estimate of all changes. Some boundary-preserving changes improve known bases/readings. Judgments: 40 new better, 0 worse, 0 neutral.

| ID | Sentence | kuromoji learner units | Default native learner units | Review | Reason |
| --- | --- | --- | --- | --- | --- |
| corpus-5 | あいつなら屋上で待ってるよ。 | あいつ / なら / 屋上 / で / 待ってるよ / 。 | あいつ / なら / 屋上 / で / 待ってる / よ / 。 | new better | Final よ remains its own click. |
| corpus-7 | これ、借りてもいいかな。 | これ / 、 / 借りても / いい / か / な / 。 | これ / 、 / 借りて / も / いい / か / な / 。 | new better | The particle も remains separate. |
| corpus-12 | お腹すいたけど、お金がない。 | お腹 / すいたけど / 、 / お金 / が / ない / 。 | お腹 / すいた / けど / 、 / お金 / が / ない / 。 | new better | Clause-final けど is separate. |
| corpus-38 | あとで連絡しとくね。 | あと / で / 連絡 / しとくね / 。 | あと / で / 連絡 / しとく / ね / 。 | new better | Keeps しとく while separating ね. |
| corpus-67 | タクシー呼んでもらえるかな。 | タクシー / 呼んでもらえるかな / 。 | タクシー / 呼んでもらえる / か / な / 。 | new better | Auxiliary chain stays whole; か/な remain separate. |
| corpus-83 | テイクアウトに変更できますか。 | テイクアウト / に / 変更 / できますか / 。 | テイクアウト / に / 変更 / できます / か / 。 | new better | Polite predicate is separate from か. |
| corpus-97 | バックアップ取ってから消して。 | バックアップ / 取ってから / 消して / 。 | バックアップ / 取って / から / 消して / 。 | new better | Temporal から no longer joins the verb. |
| corpus-100 | クレジットカード使えますか。 | クレジットカード / 使えますか / 。 | クレジットカード / 使えます / か / 。 | new better | Question particle is separate. |
| corpus-102 | 2人分で1,980円になります。 | 2 / 人 / 分 / で / 1 / , / 980 / 円 / に / なります / 。 | 2 / 人 / 分 / で / 1,980 / 円 / に / なります / 。 | new better | Comma-separated numeral stays whole; 円 stays separate. |
| corpus-108 | この箱、重さ2.5kgある。 | この / 箱 / 、 / 重 / さ / 2 / . / 5 / kg / ある / 。 | この / 箱 / 、 / 重さ / 2.5 / kg / ある / 。 | new better | Nominalized adjective and decimal are usable units; kg stays separate. |
| corpus-110 | Wi-Fiの電波、2本しか立ってない。 | Wi / - / Fi / の / 電波 / 、 / 2 / 本 / しか / 立ってない / 。 | Wi-Fi / の / 電波 / 、 / 2 / 本 / しか / 立ってない / 。 | new better | Wi-Fi stays one label. |
| corpus-111 | 3D映画って酔わない？ | 3 / D / 映画 / って / 酔わない / ？ | 3D / 映画 / って / 酔わない / ？ | new better | 3D stays one label. |
| corpus-112 | USB-Cのケーブル貸して。 | USB / - / C / の / ケーブル / 貸して / 。 | USB-C / の / ケーブル / 貸して / 。 | new better | USB-C stays one label. |
| corpus-119 | PCのCPU使用率が100%だ。 | PC / の / CPU / 使用 / 率 / が / 100 / % / だ / 。 | PC / の / CPU / 使用 / 率 / が / 100% / だ / 。 | new better | Percentage stays whole; noun components remain separate. |
| corpus-123 | 1万2000円なら買えるかも。 | 1 / 万 / 2000 / 円 / なら / 買える / かも / 。 | 1万2000 / 円 / なら / 買える / かも / 。 | new better | Mixed-script numeral stays whole; 円 stays separate. |
| corpus-124 | 23:59までに提出しなきゃ。 | 23 / : / 59 / まで / に / 提出 / しなきゃ / 。 | 23:59 / まで / に / 提出 / しなきゃ / 。 | new better | Clock label stays whole. |
| corpus-126 | 0.5秒だけ音がずれてる。 | 0 / . / 5 / 秒 / だけ / 音 / が / ずれてる / 。 | 0.5 / 秒 / だけ / 音 / が / ずれてる / 。 | new better | Decimal stays whole; 秒 stays separate. |
| corpus-131 | WindowsでもMacでも動くよ。 | Windows / で / も / Mac / で / も / 動くよ / 。 | Windows / で / も / Mac / で / も / 動く / よ / 。 | new better | Final よ remains separate. |
| corpus-135 | バージョン8.1.0に更新してください。 | バージョン / 8 / . / 1 / . / 0 / に / 更新 / してください / 。 | バージョン / 8.1.0 / に / 更新 / してください / 。 | new better | Version number stays one technical label. |
| corpus-138 | 税込みで¥3,300です。 | 税込み / で / ¥ / 3 / , / 300 / です / 。 | 税込み / で / ¥ / 3,300 / です / 。 | new better | Comma-separated amount stays whole. |
| corpus-141 | 今日の降水確率は70％らしい。 | 今日 / の / 降水 / 確率 / は / 70 / ％ / らしい / 。 | 今日 / の / 降水 / 確率 / は / 70％ / らしい / 。 | new better | Percentage stays whole; the weather compound remains split. |
| corpus-144 | 二〇二六年って書けばいい？ | 二 / 〇 / 二 / 六 / 年 / って / 書けば / いい / ？ | 二〇二六 / 年 / って / 書けば / いい / ？ | new better | Uninterrupted kanji-digit year stays whole. |
| corpus-163 | 名前：山田／年齢：十八歳。 | 名前 / ： / 山田 / ／ / 年齢 / ： / 十 / 八 / 歳 / 。 | 名前 / ： / 山田 / ／ / 年齢 / ： / 十八 / 歳 / 。 | new better | Kanji numeral stays whole; 歳 stays separate. |
| corpus-181 | ｺﾝﾋﾞﾆでﾊﾟﾝ買ってきて。 | ｺﾝﾋﾞﾆ / で / ﾊﾟﾝ / 買ってきて / 。 | ｺﾝﾋﾞﾆ / で / ﾊﾟﾝ / 買ってきて / 。 | new better | Same boundaries; normalized known bases/readings improve lookup. |
| corpus-182 | ﾊﾟｿｺﾝの画面が真っ暗だ。 | ﾊﾟｿｺﾝ / の / 画面 / が / 真っ暗 / だ / 。 | ﾊﾟｿｺﾝ / の / 画面 / が / 真っ暗 / だ / 。 | new better | Same boundaries; パソコン base and reading replace an unknown. |
| corpus-183 | ｶﾞｯﾂﾎﾟｰｽﾞしてる場合じゃない。 | ｶﾞｯﾂﾎﾟｰｽﾞ / してる / 場合 / じゃ / ない / 。 | ｶﾞｯﾂﾎﾟｰｽﾞ / してる / 場合 / じゃない / 。 | new better | Known normalized loanword plus a separate negative copula. |
| corpus-184 | ﾊﾝﾊﾞｰｶﾞｰを二つください。 | ﾊﾝﾊﾞｰｶﾞｰ / を / 二つ / ください / 。 | ﾊﾝﾊﾞｰｶﾞｰ / を / 二つ / ください / 。 | new better | Same boundaries; normalized loanword receives its reading. |
| corpus-185 | ｽｰﾊﾟｰに寄ってから帰る。 | ｽｰﾊﾟｰ / に / 寄ってから / 帰る / 。 | ｽｰﾊﾟｰ / に / 寄って / から / 帰る / 。 | new better | Known half-width loanword; temporal から stays separate. |
| corpus-188 | ２０２６年のカレンダー買った？ | ２ / ０ / ２ / ６ / 年 / の / カレンダー / 買った / ？ | ２０２６ / 年 / の / カレンダー / 買った / ？ | new better | Full-width numeral stays whole. |
| corpus-189 | ９８０円なら安いじゃん。 | ９ / ８ / ０ / 円 / なら / 安い / じゃん / 。 | ９８０ / 円 / なら / 安い / じゃん / 。 | new better | Full-width numeral stays whole; 円/じゃん stay separate. |
| corpus-190 | Ｗｉ－Ｆｉがつながらない。 | Ｗｉ / － / Ｆｉ / が / つながらない / 。 | Ｗｉ－Ｆｉ / が / つながらない / 。 | new better | Full-width Wi-Fi label stays whole, preserving its surface. |
| corpus-191 | 半角ｶﾅと全角カナ、混ぜないで。 | 半角 / ｶﾅ / と / 全角 / カナ / 、 / 混ぜないで / 。 | 半角 / ｶﾅ / と / 全角 / カナ / 、 / 混ぜないで / 。 | new better | Same boundaries; half-width カナ gets known metadata. |
| corpus-192 | ﾁｮｯﾄだけ待っててね。 | ﾁｮｯﾄ / だけ / 待ってて / ね / 。 | ﾁｮｯﾄ / だけ / 待ってて / ね / 。 | new better | Same boundaries; normalized チョット gets known metadata. |
| corpus-193 | ｳﾞｧｲｵﾘﾝの音が聞こえる。 | ｳﾞｧｲｵﾘﾝ / の / 音 / が / 聞こえる / 。 | ｳﾞｧｲｵﾘﾝ / の / 音 / が / 聞こえる / 。 | new better | Same boundaries; normalized ヴァイオリン gets a reading. |
| corpus-195 | ﾊﾟｰﾃｨｰは午後からだよ。 | ﾊﾟｰﾃｨｰ / は / 午後 / から / だ / よ / 。 | ﾊﾟｰﾃｨｰ / は / 午後 / から / だ / よ / 。 | new better | Same boundaries; normalized パーティー gets a reading. |
| corpus-214 | このケーキ、おいしそう。 | この / ケーキ / 、 / おいし / そう / 。 | この / ケーキ / 、 / おいしそう / 。 | new better | Productive appearance そう attaches to the adjective. |
| corpus-215 | そんな子供っぽいことしないで。 | そんな / 子供 / っぽい / こと / しないで / 。 | そんな / 子供っぽい / こと / しないで / 。 | new better | Lexical derivative 子供っぽい has the right lookup base. |
| corpus-217 | 山の高さを測ってみた。 | 山 / の / 高 / さ / を / 測ってみた / 。 | 山 / の / 高さ / を / 測ってみた / 。 | new better | Nominalization 高さ stays whole with its lexical base. |
| corpus-224 | 一度確認させていただけますか。 | 一度 / 確認 / させて / いただけますか / 。 | 一度 / 確認 / させていただけます / か / 。 | new better | Causative/keigo chain stays whole; か stays separate. |
| corpus-235 | 読んでみたけど難しかった。 | 読んでみたけど / 難しかっ / た / 。 | 読んでみた / けど / 難しかった / 。 | new better | Inflected adjective is whole; けど stays separate. |

## Opt-in app-node review

This separate sample compares the own base lattice with/without app nodes, before suffix composition. Judgments: 28 better, 2 neutral, 0 worse. Neutral cases improve only part of a longer compound.

| ID | Sentence | Base learner units | With opt-in JMdict nodes | Review |
| --- | --- | --- | --- | --- |
| corpus-84 | ベランダに洗濯物出しっぱなしだ。 | ベランダ / に / 洗濯 / 物 / 出し / っぱなし / だ / 。 | ベランダ / に / 洗濯物 / 出し / っぱなし / だ / 。 | better |
| corpus-119 | PCのCPU使用率が100%だ。 | PC / の / CPU / 使用 / 率 / が / 100% / だ / 。 | PC / の / CPU / 使用率 / が / 100% / だ / 。 | better |
| corpus-141 | 今日の降水確率は70％らしい。 | 今日 / の / 降水 / 確率 / は / 70％ / らしい / 。 | 今日 / の / 降水確率 / は / 70％ / らしい / 。 | better |
| corpus-142 | 令和8年、初めて雪が降った。 | 令 / 和 / 8 / 年 / 、 / 初めて / 雪 / が / 降った / 。 | 令和 / 8 / 年 / 、 / 初めて / 雪 / が / 降った / 。 | better |
| corpus-253 | 深層学習の授業を受けた。 | 深層 / 学習 / の / 授業 / を / 受けた / 。 | 深層学習 / の / 授業 / を / 受けた / 。 | better |
| corpus-254 | 情報漏洩を防がなければならない。 | 情報 / 漏洩 / を / 防がなければ / ならない / 。 | 情報漏洩 / を / 防がなければ / ならない / 。 | better |
| corpus-255 | 仮想現実の世界に入ってみた。 | 仮想 / 現実 / の / 世界 / に / 入ってみた / 。 | 仮想現実 / の / 世界 / に / 入ってみた / 。 | better |
| corpus-256 | 異世界転生ものばかり読んでる。 | 異 / 世界 / 転生 / もの / ばかり / 読んでる / 。 | 異世界 / 転生 / もの / ばかり / 読んでる / 。 | better |
| corpus-257 | 自己肯定感ってどう高めるの？ | 自己 / 肯定 / 感 / って / どう / 高める / の / ？ | 自己肯定感 / って / どう / 高める / の / ？ | better |
| corpus-260 | 睡眠不足で集中できない。 | 睡眠 / 不足 / で / 集中 / できない / 。 | 睡眠不足 / で / 集中 / できない / 。 | better |
| corpus-261 | 文化祭の実行委員になった。 | 文化 / 祭 / の / 実行 / 委員 / に / なった / 。 | 文化 / 祭 / の / 実行委員 / に / なった / 。 | better |
| corpus-262 | 図書委員会は放課後です。 | 図書 / 委員 / 会 / は / 放課後 / です / 。 | 図書委員 / 会 / は / 放課後 / です / 。 | neutral |
| corpus-263 | 生徒会長が呼んでるよ。 | 生徒 / 会長 / が / 呼んでる / よ / 。 | 生徒会長 / が / 呼んでる / よ / 。 | better |
| corpus-266 | 進路相談、まだ決めてない。 | 進路 / 相談 / 、 / まだ / 決めてない / 。 | 進路相談 / 、 / まだ / 決めてない / 。 | better |
| corpus-267 | 期末試験の範囲が広すぎる。 | 期末 / 試験 / の / 範囲 / が / 広 / すぎる / 。 | 期末試験 / の / 範囲 / が / 広 / すぎる / 。 | better |
| corpus-268 | 参考書を借りっぱなしだった。 | 参考 / 書 / を / 借り / っぱなし / だっ / た / 。 | 参考書 / を / 借り / っぱなし / だっ / た / 。 | better |
| corpus-269 | 部活動の見学に行きたい。 | 部 / 活動 / の / 見学 / に / 行きたい / 。 | 部活動 / の / 見学 / に / 行きたい / 。 | better |
| corpus-272 | 有給休暇、ちゃんと取ってる？ | 有給 / 休暇 / 、 / ちゃんと / 取ってる / ？ | 有給休暇 / 、 / ちゃんと / 取ってる / ？ | better |
| corpus-273 | 確定申告の締め切りはいつ？ | 確定 / 申告 / の / 締め切り / は / い / つ / ？ | 確定申告 / の / 締め切り / は / い / つ / ？ | better |
| corpus-274 | 業務改善の提案書を書いた。 | 業務 / 改善 / の / 提案 / 書 / を / 書いた / 。 | 業務 / 改善 / の / 提案書 / を / 書いた / 。 | better |
| corpus-275 | 在宅勤務の日は通勤しなくていい。 | 在宅 / 勤務 / の / 日 / は / 通勤 / しなくて / いい / 。 | 在宅勤務 / の / 日 / は / 通勤 / しなくて / いい / 。 | better |
| corpus-276 | 試用期間は三か月です。 | 試用 / 期間 / は / 三 / か月 / です / 。 | 試用期間 / は / 三 / か月 / です / 。 | better |
| corpus-277 | 履歴書に写真を貼ってください。 | 履歴 / 書 / に / 写真 / を / 貼ってください / 。 | 履歴書 / に / 写真 / を / 貼ってください / 。 | better |
| corpus-279 | 取引先から電話が来てる。 | 取引 / 先 / から / 電話 / が / 来てる / 。 | 取引先 / から / 電話 / が / 来てる / 。 | better |
| corpus-280 | 見積書を確認しておきます。 | 見積 / 書 / を / 確認 / しておきます / 。 | 見積書 / を / 確認 / しておきます / 。 | better |
| corpus-281 | 人工衛星が地球を回っている。 | 人工 / 衛星 / が / 地球 / を / 回っている / 。 | 人工衛星 / が / 地球 / を / 回っている / 。 | better |
| corpus-282 | 宇宙飛行士になりたかった。 | 宇宙 / 飛行 / 士 / に / なりたかった / 。 | 宇宙飛行士 / に / なりたかった / 。 | better |
| corpus-288 | 健康診断の結果が届いた。 | 健康 / 診断 / の / 結果 / が / 届いた / 。 | 健康診断 / の / 結果 / が / 届いた / 。 | better |
| corpus-293 | 空港の保安検査場は混んでいた。 | 空港 / の / 保安 / 検査 / 場 / は / 混んでいた / 。 | 空港 / の / 保安 / 検査場 / は / 混んでいた / 。 | neutral |
| corpus-464 | 初見さん、いらっしゃいませ。 | 初 / 見 / さ / ん / 、 / いらっしゃいませ / 。 | 初見 / さん / 、 / いらっしゃいませ / 。 | better |

## Your dictionary and checks

The artificial user experiment is separate: manual 推し活 and AI 量子計算 change two authored lines; coined manual 新造固有語 also changes a repository test string. Exact-JMdict AI entries remain suppressed. Custom readings/meanings survive through userDictionaryToken and do not need JMdict membership. Native tests cover context around a user word: あの remains a determiner and お remains a prefix, whereas standalone fragments from the old pre-pass changed those POS choices. Enabled entries honor the merged suppression filtering; vi retains the pre-pass and zh/yue retain their native early returns.

- npm run lint:smells: no issues.
- npm test: 1,077 passed, zero failed/skipped.
- npx tsc -p renderer --noEmit: exit 0.
- npx tsc --noEmit: exit 0.
- node scripts/buildBackendWorker.mjs: exit 0, 3.9 MB worker, zero warnings.
- cargo test in native/rust: 21 unit + 1 IPADIC integration passed; zero failures.
- cargo test in src-tauri: 86 passed, 4 existing ignored; zero failures.
- Release-like Tauri build, gold dev/test scoring, reconstruction, batch-codec fixture and live add/remove/popup checks pass.

No new dictionaries/corpora were downloaded, no pack format or UI changed, and Chinese/lexicon source files were preserved. Research, fallback instructions and reproduction commands: JAPANESE_TOKENIZER.md. Remaining limits include some recent kana loanwords, lexical prefixes and semantic ambiguity; the held-out test was not used to tune those.
