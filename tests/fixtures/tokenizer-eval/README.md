# Tokenizer learner-click yardstick

1,200 original subtitle-style lines: 300 each of Japanese, simplified Mandarin,
traditional Mandarin and Cantonese. Read [GUIDELINES.md](GUIDELINES.md) before
annotating, judging or tuning. No published subtitles, downloaded corpus or new
dictionary is used. No application behavior is changed.

## Files and provenance

- Each variant has 150 dev and 150 test lines. Gold arrays reconstruct text
  exactly. IDs are stable; categories are multi-label, not mutually exclusive.
- source/ retains unsegmented original dialogue. A authored Japanese/simplified
  Mandarin; C authored traditional Mandarin/Cantonese. A and C annotated their
  own dialogue only after saving those raw sources.
- annotations/a.jsonl and annotations/b.jsonl are independent judgments of the
  first pair of variants; c.jsonl and d.jsonl judge the second pair. All four
  are separate GPT-6.1 Sol agents with max reasoning. B/D received only the
  guidelines and raw sentences. No annotator saw another's output, dictionary
  membership, predictions or proposed gold. This is independent LLM annotation,
  **not independent human annotation or proof of linguistic correctness**.
- adjudications.jsonl retains every disagreement with its chosen full array
  and a one-line policy reason. Dictionary-stage corrections are recorded
  separately. A fifth agent was not used: the parent LLM adjudicated.
- dictionary-exceptions.jsonl explicitly flags each unindexed multi-character
  surface per line as name or OOV, including inflections, English and numbers.
  Dictionary absence never silently licenses a questionable lexical merge.
- agreement.json and agreement.md report the untouched annotator arrays,
  before adjudication. dictionary-coverage.json includes dictionary checksums
  and coverage totals. baseline/ retains the final current-pipeline run,
  predictions, score details, per-category results, worst lines and input hashes.
- provenance.json records source/annotation/fixture hashes and split policy.
  Freeze test after adjudication; use only dev while tuning. Held-out means
  **not used for tokenizer tuning**, not secret or inaccessible to the authors.

This intentionally difficult small set is not a random sample of subtitles.
Use category and script results alongside aggregate F1; model agreement and
dictionary coverage do not establish real-world accuracy. Dictionary-version
changes require explicit re-audit, not silently regenerated gold.

## Tool-agnostic scoring

Requires the repository's installed Node dependencies (Node 22.15+).

    npx tsx scripts/evalTokenizers.ts --predictions my-dev.jsonl --split dev --json dev-scores.json --markdown dev-scores.md
    npx tsx scripts/evalTokenizers.ts --predictions my-ja-dev.jsonl --variant ja --split dev
    npx tsx scripts/evalTokenizers.ts --predictions final-test.jsonl --split test

Prediction JSONL is exactly one object per selected ID:

    {"id":"ja-001","tokens":["その","プリン","、","私","の","だ","よ","。"]}

Order is irrelevant. Missing, extra/out-of-scope or duplicate IDs, invalid arrays,
empty tokens, malformed Unicode or non-reconstructing text fail the run.
Default scope is **all variants, dev only**; explicitly select all or test for
final reporting. Use --fixtures DIRECTORY for an alternate fixture root and
--worst NUMBER (default 10, zero disables) to control worst-line output.

Boundary offsets use Unicode code points, excluding only the sentence endpoints.
Metrics include punctuation and whitespace boundaries. P/R/F1 are micro counts;
exact-match is whole-line token-array equality. When both boundary sets are
empty, P/R/F1 are 1; if only one is empty, F1 is 0. Categories overlap, so their
counts must not be added as though disjoint. Worst non-exact lines sort by F1,
then boundary-error count, then ID. JSON retains raw counts and differing offsets.

## Existing pipeline baseline (no profile or downloads)

Point --assets at an **already available local** language-assets directory:

    npx tsx scripts/runTokenizerBaseline.ts --assets LOCAL_LANGUAGE_ASSETS --split dev --out baseline-dev
    npx tsx scripts/runTokenizerBaseline.ts --assets LOCAL_LANGUAGE_ASSETS --split all --out baseline-final

Without --assets, the repository renderer/public/language-assets is used. Missing
assets are errors; the runner does not fetch them or read an installed app's
profile. No access to APPDATA/miteiru, dictionary database, saved words or manual
entries occurs. It calls the same Node-capable handlers as tests/verbConjugation:

- Japanese: the pack's IPADIC, kuromoji.js tokenizeForSentence,
  Japanese.processKuromojinToSeparations, then the actual parseJapaneseVerbs.
- Mandarin/Cantonese: @node-rs/jieba with the respective pack's zh.jieba.txt or
  yue.jieba.txt and default cut HMM, then the actual Chinese.tokenizeUsingJieba
  or Chinese.getJyutpingForSentence, taking their origin fields.
- User-dictionary overrides are deliberately absent. Do not compare a custom-
  dictionary-enabled candidate to this baseline without disclosing that change.
- This is the requested Node baseline of the current JS token-building pipeline;
  it does not claim byte-identical behavior to a packaged native bridge build.

The run writes predictions.jsonl, scores.json, scores.md and manifest.json.
Re-score with evalTokenizers.ts using matching --split/--variant. Final baseline
test scores are descriptive reporting only; no gold or policy is adjusted to
make the baseline score better after predictions are inspected.

## Reproduce data checks

    npx tsx scripts/checkTokenizerEvalDictionary.ts --assets LOCAL_LANGUAGE_ASSETS --report coverage.json
    npx tsx scripts/tokenizerAgreement.ts --json agreement.json --markdown agreement.md
    npm run lint:smells
    npm test
    npx tsc --noEmit

Dictionary checking reads existing JMdict, CC-CEDICT and CantoDict JSONs,
including a local compressed copy where supported. It checks **exact surfaces**,
not tokenizer vocabulary. It fails on any unflagged multi-character lexical
unit, stale flag, unknown line/token or duplicate flag. No dictionaries are
vendored. The small npm tests validate reconstruction, unique IDs, split/category
coverage, double annotation/adjudication coverage, frozen input hashes and scorer failure cases;
they do not need the large language packs.

On Windows PowerShell with scripts disabled, use npm.cmd/npx.cmd; these execute
the same package scripts without changing the machine's execution policy.
