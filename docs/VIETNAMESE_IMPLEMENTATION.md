# Vietnamese Language Implementation

This document details the Vietnamese language implementation in Miteiru.

## Overview

Vietnamese support was added to Miteiru with the following features:
- Longest-match suffix tokenization algorithm
- Vietnamese-English dictionary lookup (54,375+ entries)
- Word-level meaning annotation
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
        { "main": "Việt", "meaning": "Vietnam, Vietnamese" },
        { "main": " " },
        { "main": "Nam", "meaning": "Vietnam, Vietnamese" }
    ]
}
```

**Fields:**
- `origin`: Original Vietnamese text
- `meaning`: English translation from dictionary
- `separation`: Array of word components with individual meanings

### Tokenization Algorithm

**Longest-Match Suffix Parsing:**

1. Start from the beginning of the sentence
2. For each position, try to find the longest dictionary match
3. If match found, add token with full meaning
4. If no match, add single character token
5. Continue until end of sentence

```typescript
static tokenizeLongestSuffix(sentence: string): VietnameseTokenResult[] {
  const result: VietnameseTokenResult[] = [];
  let i = 0;
  
  while (i < sentence.length) {
    let matched = false;
    
    // Try longest match first (dictionary sorted by length desc)
    for (const term of this.sortedTerms) {
      if (sentence.slice(i).startsWith(term)) {
        const meaning = this.dictionary.get(term) || '';
        
        // Split multi-word terms by spaces
        const words = term.split(/(\s+)/);
        const separation = words.map(word => ({
          main: word,
          meaning: word.trim() ? meaning : undefined
        }));
        
        result.push({
          origin: term,
          meaning: meaning,
          separation: separation
        });
        
        i += term.length;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // Add single character if no match
      const char = sentence[i];
      result.push({
        origin: char,
        meaning: '',
        separation: [{ main: char }]
      });
      i += 1;
    }
  }
  
  return result;
}
```

### Dictionary Format

The Vietnamese dictionary (`app/vietnamese/vnedict.txt`) uses this format:

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

### File Structure

```
app/vietnamese/
└── vnedict.txt              # Vietnamese-English dictionary

main/handler/
└── vietnamese.ts            # Main language handler

renderer/
├── hooks/
│   ├── useLanguageManager.tsx    # Added Vietnamese to language list
│   └── useMiteiruTokenizer.tsx   # Added Vietnamese tokenization
├── components/Subtitle/
│   ├── DataStructures.ts         # Vietnamese subtitle processing
│   ├── Subtitle.tsx             # Vietnamese rendering support  
│   └── ScrollingLyrics.tsx      # Vietnamese lyrics support
└── utils/
    └── constants.ts             # Vietnamese language constants
```

### Integration Points

**1. Language Selection (`useLanguageManager.tsx`):**
```typescript
{
  id: 4,
  name: 'Vietnamese',
  channel: 'loadVietnamese',
  emoji: '🇻🇳',
  description: 'Chúc may mắn! 🌟'
}
```

**2. Tokenization (`useMiteiruTokenizer.tsx`):**
```typescript
} else if (tokenizerMode === "vietnamese") {
  res = await window.ipc.invoke('tokenizeUsingVietnamese', sentence);
}
```

**3. Subtitle Processing (`DataStructures.ts`):**
```typescript
async adjustVietnamese(tokenizeMiteiru: (string) => Promise<any[]>) {
  const promises = [];
  for (let i = 0; i < this.lines.length; i++) {
    if (globalSubtitleId !== this.id) return;
    const line = this.lines[i];
    promises.push(line.fillContentSeparations(tokenizeMiteiru));
    promises.push(line.fillContentWithLearningVietnamese(this.frequency));
    this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
  }
  await Promise.all(promises);
  this.progress = 'done';
}
```

**4. Language Constants (`constants.ts`):**
```typescript
vietnameseLang: 'vi',
varLang: {
  "vi": ["vi"]
},
ocrLang: {
  "vi": "vie",
}
```

### Subtitle Language Detection

Vietnamese implements the requested subtitle language detection algorithm:

```typescript
// In SubtitleContainer.create()
const isForcedEnglish = filename.includes('.en.');

// Language assignment
isForcedEnglish ? videoConstants.englishLang : lang
```

**Logic:**
- If filename contains `.en.` → English (secondary subtitle)
- If filename doesn't contain `.en.` → Native language (Vietnamese → primary subtitle)

**Examples:**
- `movie.srt` → Vietnamese (primary)
- `movie.vi.srt` → Vietnamese (primary) 
- `movie.en.srt` → English (secondary)

### Rendering Integration

**Sentence Detection:**
```typescript
const isVietnameseSentence = val.separation && !val.jyutping && !val.pinyin && !val.hiragana;
```

**Component Usage:**
Vietnamese reuses the `ChineseSentence` component which provides:
- Word-level hover tooltips
- Click to copy functionality
- Learning state integration
- Meaning display support

**Ruby HTML Generation:**
```typescript
} else if (isVietnameseSentence) {
  reading = part.meaning || '';
}
```

This enables Vietnamese meanings to appear in hover tooltips and ruby text formatting.

### Learning Mode Integration

Vietnamese integrates with Miteiru's learning system:

**Dictionary Lookup:**
```typescript
async fillContentWithLearningVietnamese(frequency) {
  this.meaning = Array(this.content.length).fill('');
  for (let i = 0; i < this.content.length; i++) {
    const word = this.content[i];
    const target = word.origin;
    frequency.set(target, (frequency.get(target) ?? 0) + 1);
    await window.ipc.invoke('queryVietnamese', target, 3).then(val => {
      // Process dictionary results and assign meanings
    })
  }
}
```

**Features:**
- Word frequency tracking
- Dictionary search with relevance scoring
- Meaning cleanup and formatting
- Learning state management

### Performance Optimizations

1. **Dictionary Sorting**: Terms sorted by length (longest first) for efficient matching
2. **Map-based Lookup**: Uses JavaScript Map for O(1) dictionary access
3. **Lazy Loading**: Dictionary loaded only when Vietnamese mode selected
4. **Memory Management**: Large dictionary loaded once and reused

### Testing & Validation

The Vietnamese implementation has been tested with:
- Various Vietnamese text inputs
- Subtitle file loading (.srt, .vtt formats)
- Dictionary lookup functionality
- Learning mode integration
- Language switching

### Known Limitations

1. **Compound Words**: Some Vietnamese compound words may not be in dictionary
2. **Proper Nouns**: Modern proper nouns may be missing from dictionary
3. **Colloquialisms**: Informal expressions may not be covered
4. **Tokenization Edge Cases**: Very long sentences may have performance impact

### Future Improvements

1. **Enhanced Dictionary**: Add more modern terms and expressions
2. **Tone Support**: Add Vietnamese tone marking support
3. **Grammar Analysis**: Implement basic Vietnamese grammar analysis
4. **Performance**: Optimize tokenization for very long texts
5. **Cultural Context**: Add cultural context annotations

---

This implementation provides comprehensive Vietnamese language support following Miteiru's established patterns and architecture.
