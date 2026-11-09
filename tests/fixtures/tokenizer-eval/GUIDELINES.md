# Miteiru learner-click segmentation v1

Gold represents **what a learner should click and look up**, not a regression
snapshot of today's tokenizer. Write original subtitle-style dialogue; never
copy published subtitles. Apply this policy without seeing predictions.

## Common rules

- Preserve every character, including spaces, punctuation, emoji, casing and
  full-width forms. Joining tokens must reproduce the UTF-8 input exactly.
  Never normalize scripts or whitespace.
- Each punctuation character is a token; contiguous whitespace is one token.
  Decimal points inside numbers and apostrophes/hyphens inside English words
  belong to their word. `…` is one token; `……` is two.
- Prefer natural contextual dictionary units, not shortest characters or blind
  longest matching. A dictionary phrase does not override grammatical particles.
- Keep each uninterrupted English word, acronym, handle or technical label
  together (`Wi-Fi`, `USB-C`, `GPT`, `v2`, `#tag`, `@handle`). Spaces separate
  words. Never absorb adjacent Han words or particles into English.
- Keep a numeral together, including decimal/percentage (`3.5`, `20%`); normally
  separate its unit/counter. Split dates into numerals and units; `12:30` is a
  single conventional label. Do not split uninterrupted `五百` into `五 / 百`.
- Unspaced Chinese personal names are single names; Japanese written surname
  and given-name components are separate when recognizable. Split titles and
  address suffixes. Established places/organizations use lexical components,
  not arbitrary entire addresses. Flag novel names instead of guessing words.
- Every multi-character lexical gold surface must be indexed in the matching
  local dictionary or explicitly flagged `name` or `oov` in
  `dictionary-exceptions.jsonl` (per line and surface, with reason). This applies
  to English and numerals too. Japanese inflections absent as headwords are
  surface OOV with a morphological reason, not claims of missing lemmas.
  Punctuation/whitespace are structural. Do not break valid morphology simply
  to avoid an exception; exceptions are visible decisions, not extra entries.

## Japanese (`ja`)

### Application intent and known gaps

`main/handler/japanese.ts` loads kuromoji, then
`processKuromojinToSeparations` builds words. In
`main/handler/languages/analyzer.ts`, `parseJapaneseVerbs` joins a verb and
following auxiliaries/selected particles/dependent verbs while
`isConjugationOf(surface, lemma)` accepts them. Popup `queryJapanese` calls
`searchJapanese` in `learningGlosses.ts`, which searches surface and inflection
candidates. Prefer usable conjugated clicks over unusable stem fragments.
Coverage uses JMdict `words[].kanji[].text` and `words[].kana[].text`, not IPADIC.

Current merging begins only at verbs, so adjective/derivational chains can
fragment. The conjugation grammar accepts modality and some final particles
inside a verb. Gold deliberately separates those; IPADIC may also fragment
names/loanwords. These are diagnostic shortcomings, not gold conventions.

### Units

- Keep dictionary nouns, adverbs and compounds intact, not arbitrary noun
  phrases. A verbal noun before `する` stays separate: `勉強 / しています`.
- Attach negation, tense, politeness, passive, causative, potential, volition,
  desire and their chains: `食べさせられなかった`, `行きませんでした`,
  `読みたい`, `読みたくなかった` are single clicks.
- Attach auxiliary `て/で` chains/contractions: `読んでいる`, `読んでる`,
  `食べてしまった`, `食べちゃう`, `飲んじゃった`, `書いておく`, `書いとく`,
  `見てみたい`, `帰ってきた`, `持っていった`, `教えてもらった`,
  `待ってください`, `来てほしい`, `行かなきゃ`, `やらなくちゃ`.
- Independent second actions are separate. Follow today's explicit breakers:
  `教えて / やる`, `読んだり / する`; do not absorb coordinated clauses.
- Inflected i-adjectives stay whole (`寒くなかった`, `おいしくて`). Separate
  copulas after nouns/na-adjectives: `静か / です`, `学生 / だった`.
  Separate modality after a complete predicate: `降る / だろう`,
  `帰った / らしい`. Current `降るだろう` grouping is not gold.
- Attach productive appearance `そう`, excess `すぎる`, `がる`, `っぽい`:
  `おいしそう`, `食べすぎた`, `子供っぽい`. Reportative `そう / だ` after
  a complete predicate is separate: `降る / そう / だ`. Evidential `よう`
  and `みたい` are separate, unlike auxiliary `てみる`.
- Separate address/group suffixes: `田中 / さん`, `美咲 / ちゃん`,
  `先生 / たち`, `僕 / ら`. Lexicalized `皆さん` may stay whole.
  Separate numerals/counters (`三 / 人`, `2 / 枚`), but keep lexical `一人前`.
- Keep particles separate: `は`, `が`, `を`, `に`, `と`, `の`, `も`, `だけ`,
  `まで`, `ので`, `なら`, `し`, `よ`, `ね`, `か`, `ぞ`, `ぜ`, `な`, `って`.
  Inflectional `て/で`, `たら`, `たり`, `ながら` remain with the verb as
  the explicit exception. Discourse/copular `じゃん`, `っす` are separate.
- Keep established katakana loanwords whole, including lexical internal `ー`
  or `・`; never absorb a following particle. Invented attacks/products/names
  require OOV/name exceptions.

## Mandarin (`zh-Hans`, `zh-Hant`)

Use CC-CEDICT `mandarin/chinese/chinese.json`, `words[].content` and
`words[].simplified`. Both scripts use identical policy but independently
authored lines, not translations of one another. Never convert at scoring.

- Keep lexical words (`今天`, `朋友`, `電腦`/`电脑`), not transparent phrases.
- Keep full personal names (`林小雨`) whole; split titles (`林小雨 / 老师`,
  `王 / 先生`). Flag non-dictionary names.
- Separate numerals, measure words, units and nouns: `三 / 个 / 苹果`,
  `二十 / 分钟`, `3.5 / 公里`. Lexical `一会儿`, `一点儿` stay whole.
- Separate grammatical `了`, `的`, `地`, `得`, `过/過`, `着/著`:
  `看 / 了`, `我 / 的`, `跑 / 得 / 快`. Keep lexical words containing them:
  `了解`, `觉得/覺得`, `目的`, `了不起`, `睡着/睡著` (fall asleep).
- Lexicalized reduplication is one unit **if indexed** (`慢慢`, `看看` when
  present). Otherwise productive reduplication is base/base (`聊 / 聊`).
  Separate A-not-A and inserted 一: `看 / 一 / 看`, `好 / 不 / 好`.
  Indexed AABB/ABB adjectives stay whole; unindexed ones need meaningful
  components or explicit OOV, not assumed dictionary membership.
- Indexed four-character idioms are one unit (`一石二鸟`, `畫蛇添足`).
  Arbitrary four-character phrases are not idioms. Flag unindexed true idioms.
- Keep indexed lexical/resultative compounds (`看见/看見`, `听懂/聽懂`,
  `找到`, `打开/打開`); split unindexed compositional verb/result (`推 / 开`).
  Inserted potential 得/不 always separates (`看 / 不 / 懂`). Directional
  complements are separate unless the whole is indexed in that sense;
  an indexed `出来/出來` complement stays whole.
- Separate interjections/final particles (`啊`, `吧`, `吗/嗎`, `呢`, `呀`).
  Internet slang/acronyms (`YYDS`, `绝绝子`, `笑死`) need lexical or OOV
  treatment, not arbitrary character fallback.

## Cantonese (`yue`)

Use CantoDict `cantonese/cantonese/cantodict.json`, content/simplified fields.
Write natural Hong Kong colloquial Cantonese, not Mandarin plus final particles.

- Preserve `佢`, `冇`, `嘢`, `睇`, `喺`, `啲`, `咗`, `緊` exactly. Keep
  indexed lexical `唔該`, `唔好`, `而家`, `點解`, `乜嘢`, `邊度`, `一陣`
  together in their lexical sense; do not substitute Mandarin equivalents.
- Separate aspect `咗`, progressive `緊`, experience `過`, structural `嘅`,
  classifier/determiner `啲`, negation `唔` from neighboring words. Indexed
  lexical `唔該` and prohibitive `唔好` override character splitting.
  A-not-A is `去 / 唔 / 去`.
- Separate each sentence-final particle from its host **and other particles**:
  `喇`, `啦`, `咩`, `囉`, `嘅`, `㗎`, `啫`, `喎`, `呀`, `吖`, `嘛`, `呢`,
  `噃`, `嗱`, `嘞`. Thus `嚟 / 㗎 / 喇`, never `嚟㗎喇` or `㗎喇`.
  Fused orthographic `㗎` is one character, not normalized to `嘅啊`.
- Indexed resultative/directional compounds stay whole (`睇到`, `搵到` if
  indexed); otherwise split verb and complement. Potential insertion separates
  (`睇 / 唔 / 到`). Numerals/counters/names/idioms follow Mandarin conventions,
  but dictionary decisions are against **CantoDict**, not CC-CEDICT.
- Preserve code-switched English lexical words/morphology (`meeting`,
  `deadline`, `check-in`), separate spaces and Cantonese particles/aspect:
  `send / 咗`, `開 / meeting`, `OK / 喇`. Mixed-script brands/handles may be
  name exceptions, not excuses to swallow surrounding words.

## Annotation and evaluation protocol

- Two LLM annotators work independently with these guidelines and raw
  `{id,text,categories}` only. Do not read each other's output, dictionaries,
  tokenizer predictions, or proposed gold. An annotator may author its raw
  dialogue first; authorship must be disclosed.
- Retain untouched arrays under `annotations/`. After both finish, adjudicate
  **every** disagreement in `adjudications.jsonl` with selected tokens and one
  line of reasoning, including decisions choosing either original array.
  Record dictionary-informed corrections of consensus separately too.
- Use fixed category-balanced 150/150 dev/test splits per variant and unique
  IDs. Do not put near-duplicate/translated templates across splits. Freeze
  test after adjudication. Tune only dev; baseline test evaluation is final
  descriptive reporting, never tuning input.
- Metrics count internal **Unicode code-point offsets**, not bytes/UTF-16.
  Include space/punctuation boundaries. Report micro boundary P/R/F1,
  whole-line exact match, multi-label category breakdown and worst lines.
  Empty boundary sets on both sides score F1 1; exact match includes all lines.
- Agreement is symmetric micro boundary F1 between untouched annotator arrays,
  per variant and split, **before** adjudication. It is model/model agreement,
  not human-validated accuracy. Dictionary coverage is not linguistic grading.
- Predictions contain exactly one `{id,tokens:string[]}` per selected line,
  no foreign IDs, no empty tokens and exact text reconstruction. Malformed,
  missing, duplicate or corrupted predictions are errors, never dropped from
  the denominator. Scope must explicitly select dev for dev-only tuning.
