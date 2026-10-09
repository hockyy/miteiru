# Vietnamese Language Implementation

This document details the Vietnamese language implementation in Miteiru.

## Overview

Vietnamese support provides:
- Longest-match tokenization over syllables, from the end of the line
- Vietnamese-English dictionary lookup (VNEDict, 54,375+ entries)
- Word-level meaning annotation in learning mode
- Subtitle processing and rendering
- Learning mode integration

## Implementation Details

### Token Structure

Vietnamese tokens follow this structure:

```json
{
    "origin": "Việt Nam",
    "meaning": "Vietnam, Vietnamese",
    "separation": [
        { "main": "Việt" },
        { "main": "Nam!" }
    ]
}
```

**Fields:**
- `origin`: The matched dictionary key, so lookups and learning state use it directly. It can differ
  from the subtitle text in case ("Tôi" → `tôi`) and never includes surrounding punctuation.
- `meaning`: The dictionary translation, or `""` when the word is not in the dictionary.
- `separation`: One `{main}` part per syllable, exactly as written in the subtitle (case and
  punctuation kept, e.g. `"Nam!"`). Parts carry no `meaning`.

### Tokenization Algorithm

`Vietnamese.tokenizeLongestSuffix` in `main/handler/vietnamese.ts`:

1. Split the line on whitespace into syllables. Each syllable keeps its raw text and is split into
   leading punctuation, core, and trailing punctuation (`"Nga,"` → core `Nga`, trailing `,`).
2. Walk from the last syllable to the first. At syllable `i`, try spans `j..i` from the longest
   (`j = 0`) to the shortest (`j = i`) and take the first whose cores, joined with spaces, are a
   dictionary entry.
3. A span may not cross punctuation: only its first syllable may have leading punctuation and only
   its last may have trailing punctuation, so `nước, Nga` never matches `nước Nga`.
4. Each candidate is looked up as written, then with a lowercase first letter (sentence-initial
   `Nước Nga` → `nước Nga`), then all lowercase (`Hôm nay` → `hôm nay`).
5. A syllable with no match becomes its own token with an empty `meaning`; bare punctuation
   (`-`) is a token too.
6. Tokens are collected right to left and reversed at the end.

```typescript
// Simplified from Vietnamese.tokenizeLongestSuffix
for (let i = chunks.length - 1; i >= 0; i--) {
  let matched = false;
  for (let j = 0; j <= i; j++) {
    if (!canSpan(j, i)) continue;                       // no punctuation inside the span
    const key = findDictionaryKey(cores(j, i).join(' '));  // exact, first letter lowercased, all lowercase
    if (key) {
      result.push({origin: key, meaning: dictionary.get(key), separation: raws(j, i).map((main) => ({main}))});
      matched = true;
      i = j;
      break;
    }
  }
  if (!matched) result.push({origin: chunks[i].core || chunks[i].raw, meaning: '', separation: [{main: chunks[i].raw}]});
}
result.reverse();
```

**Examples** (from `tests/vietnameseTokenizer.test.ts`):

| Subtitle | Tokens (`origin` ← shown text) |
|---|---|
| `Nga, rồi.` | `Nga` ← `Nga,` · `rồi` ← `rồi.` |
| `Tôi yêu Việt Nam!` | `tôi` ← `Tôi` · `yêu` · `Việt Nam` ← `Việt Nam!` |
| `Nước Nga, rồi.` | `nước Nga` ← `Nước Nga,` · `rồi` ← `rồi.` |
| `nước, Nga` | `nước` ← `nước,` · `Nga` (no match across the comma) |
| `- Xin  chào...` | `-` · `Xin` · `chào` ← `chào...` (unknown words keep an empty meaning) |

### Dictionary Format

The dictionary (`language-assets/vietnamese/vietnamese/vnedict.txt`, part of the `vietnamese`
language asset) uses one entry per line:

```
Vietnamese term : English translation
Việt Nam : Vietnam, Vietnamese
thì phải : (tag question expecting a positive answer), perhaps
nói đến : to talk about
```

**Features:**
- 54,375+ Vietnamese-English entries
- Covers common words, phrases, and proper nouns
- Includes grammatical annotations and usage notes
- UTF-8 encoding with Vietnamese diacritics

Each line is split on ` : ` and the first two parts (term, translation) are trimmed and stored in a `Map`; the few malformed lines with a second ` : ` lose what follows it.

### File Structure

```
language-assets/vietnamese/
└── vietnamese/vnedict.txt          # Vietnamese-English dictionary

main/handler/
├── vietnamese.ts                   # Dictionary loading, tokenizer, queryVietnamese / learningGlossesVietnamese
└── languages/
    ├── registry.ts                 # "vietnamese" language plugin (asset path, setup)
    ├── analyzer.ts                 # analyzeText → Vietnamese.tokenizeLongestSuffix
    └── learningGlosses.ts          # pickVietnameseGloss (short learning-mode meaning)

renderer/
├── languages/manifest.ts           # Vietnamese language mode and language code "vi"
└── components/Subtitle/
    └── subtitleLanguageSupport.ts  # Learning-mode support (frequency key, gloss channel)
```

### Integration Points

**1. Language mode (`renderer/languages/manifest.ts`):**
```typescript
{
  id: 4,
  pluginId: "vietnamese",
  name: "Vietnamese",
  channel: "loadVietnamese",
  tokenizerMode: "vietnamese",
  languageCode: languageCodes.vietnamese
}
```

**2. Tokenization:** the renderer calls the shared `analyzeText` IPC channel, which dispatches on
the active tokenizer mode:
```typescript
if (tokenizerMode === "vietnamese") {
  if (!Vietnamese.isLoaded) throw new Error("Vietnamese dictionary not loaded");
  return Vietnamese.tokenizeLongestSuffix(sentence);
}
```

**3. Meaning panel:** `queryVietnamese` returns the exact dictionary entry, if any:
`[{content, meaning}]`.

### Primary and Secondary Subtitles

When a subtitle is dropped, Miteiru asks whether to load it as the primary subtitle (tokenized and
analyzed for learning) or the secondary one (shown as plain reference text).

### Rendering Integration

Tokens are classified by `getSubtitleTokenPresentation` in `subtitleLanguageSupport.ts`. A token
with a `separation` array but no `hiragana`, `pinyin`, or `jyutping` is Vietnamese and is rendered
with the `ChineseSentence` component:

```typescript
{
  matches: (token) => Array.isArray(token?.separation),
  presentation: {sentenceKind: "chinese", getRubyReading: (part) => part?.meaning || ""}
}
```

Vietnamese parts carry no `meaning`, so there is no per-part ruby reading (and the ruby copy, C,
has empty readings). The learning-mode gloss is drawn under each word from the line's `meaning`
array, passed to the sentence component as `wordMeaning`.

### Learning Mode Integration

`fillSubtitleWithLearningContent` (`subtitleLanguageSupport.ts`) processes a subtitle 32 lines at a
time:

1. Each line is tokenized through `analyzeText`.
2. Every token's `origin` is counted in the subtitle's word frequency table.
3. Words not seen earlier in the subtitle are sent in one `learningGlossesVietnamese` call. Main looks
   each up exactly and returns the shortest meaningful part of the translation (≤ 15 characters,
   notes in parentheses and brackets removed; `pickVietnameseGloss`).
4. The glosses become the line's `meaning` array, shown under the words.

### Performance

1. **Map lookup:** each candidate span is one `Map` lookup (up to three with the case fallbacks).
2. **Short spans:** a line has few syllables, so trying every span is cheap.
3. **Lazy loading:** the dictionary loads when Vietnamese mode is selected and is reused.
4. **Batched glosses:** learning mode looks each distinct word up once per subtitle.

### Testing & Validation

`tests/vietnameseTokenizer.test.ts` pins the tokenizer: punctuation around syllables, the lowercase
fallbacks, no matches across punctuation, and unknown words and bare punctuation.
`tests/learningGlosses.test.ts` covers the learning-mode gloss.

### Known Limitations

1. **Compound Words**: Some Vietnamese compound words may not be in dictionary
2. **Proper Nouns**: Modern proper nouns may be missing from dictionary
3. **Colloquialisms**: Informal expressions may not be covered
4. **Ambiguous Spans**: Longest match from the end can pick a different split than a speaker would

### Future Improvements

1. **Enhanced Dictionary**: Add more modern terms and expressions
2. **Tone Support**: Add Vietnamese tone marking support
3. **Grammar Analysis**: Implement basic Vietnamese grammar analysis
4. **Cultural Context**: Add cultural context annotations

---

This implementation provides comprehensive Vietnamese language support following Miteiru's established patterns and architecture.
