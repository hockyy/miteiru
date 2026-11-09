# Blind LLM comparison of two tokenizer outputs

1. Read tests/fixtures/tokenizer-eval/GUIDELINES.md. Select dev for tuning; test
   is final reporting only. Do not reveal tokenizer identities or old scores.
2. Validate both arrays against the exact source text with evalTokenizers.ts.
   Missing/corrupt lines are invalid results, not neutral linguistic judgments.
3. Show the judge only id, text, categories, the relevant guideline sections
   and randomized A/B arrays for differing lines. Include local dictionary
   membership evidence if lexicality is disputed; do not invent membership.
4. Judge learner lookup utility: intact inflections/lexical compounds, correct
   grammatical particles, names/counters, script preservation and code-switch
   boundaries. A higher longest-match rate is not intrinsically better.
5. Return one JSON object per differing line: id, verdict (A-better, B-better,
   neutral), reason (one line citing a policy), confidence (high/medium/low).
   Mark equally defensible ambiguity neutral; missing dictionary evidence
   lowers confidence. Do not silently rewrite the gold.
6. Unblind only after decisions are saved. Report counts by variant, split and
   category, with confidence and representative disagreements. Keep these
   qualitative verdicts separate from boundary F1 and exact-match metrics.
