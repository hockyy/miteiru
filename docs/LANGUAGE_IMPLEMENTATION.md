# Language Implementation Guide

This document explains how to add new language support to Miteiru and documents the existing language implementations.

## Overview

Miteiru supports multiple languages for subtitle tokenization and dictionary lookup. Each language implementation consists of:

1. **Main Process Handler** - Tokenization and dictionary queries
2. **Renderer Integration** - UI components and language selection
3. **Subtitle Processing** - Language-specific subtitle rendering
4. **Dictionary Data** - Language-specific dictionaries and resources

Language assets are organized as plugin-owned folders under `renderer/public/language-assets/`.
The app currently consumes unpacked folders, and each plugin folder includes an `asset-manifest.json`
so the same layout can later be packed as downloadable `assets.zip` archives.

Current asset ownership:

- `han-character-core/` owns shared Han-character resources such as `kanji/`, `hanzi/`, and `wanikani/`.
- `japanese/` owns Japanese dictionaries under `dict/`.
- `mandarin/` owns Mandarin assets under `chinese/`.
- `cantonese/` owns Cantonese assets under `cantonese/`.
- `vietnamese/` owns Vietnamese assets under `vietnamese/`.

## Existing Language Implementations

### Japanese (Kuromoji & MeCab)

**Token Structure:**
```json
{
    "origin": "我",
    "hiragana": "わが",
    "basicForm": "我",
    "pos": "名詞-一般",
    "separation": [
        {
            "main": "我",
            "hiragana": "わが",
            "romaji": "waga",
            "isKana": false,
            "isKanji": true,
            "isMixed": false
        }
    ]
}
```

**Features:**
- **Advanced morphological analysis** with detailed part-of-speech tagging
- **Furigana (hiragana readings)** for kanji characters
- **Romaji transliteration** for all text
- **Character type classification** (kana/kanji/mixed) for each component
- **Verb conjugation analysis** - identifies base forms (e.g., "見たよ" → "見る")
- **Smart compound word handling** - keeps semantic units together ("日本語")
- **Mixed script support** - handles kanji + hiragana combinations ("か月")
- **Foreign text handling** - processes numbers and Latin text appropriately
- **Particle recognition** - identifies and classifies grammatical particles
- **Counter word support** - handles Japanese counting systems
- **JMDict dictionary integration** with comprehensive definitions

**Files:**
- `main/handler/japanese.ts` - Main handler
- `app/dict/jmdict.json` - Japanese-English dictionary
- `app/dict/kanjidic.json` - Kanji character dictionary
- `app/kanji/` - Kanji stroke order SVGs

### Chinese (Mandarin & Cantonese)

**Mandarin Token Structure:**
```json
{
    "origin": "我",
    "pinyin": "wǒ",
    "separation": [
        {
            "main": "我",
            "pinyin": "wǒ"
        }
    ]
}
```

**Cantonese Token Structure:**
```json
{
    "origin": "我",
    "jyutping": "ngo⸝₅",
    "separation": [
        {
            "main": "我",
            "jyutping": "ngo⸝₅"
        }
    ]
}
```

**Features:**
- Jieba tokenization for word segmentation
- Pinyin pronunciation for Mandarin
- Jyutping romanization for Cantonese
- CC-CEDICT dictionary integration
- Traditional/Simplified Chinese support
- Tone symbols and numbers

**Files:**
- `main/handler/chinese.ts` - Main handler for both variants
- `app/chinese/chinese.json` - Mandarin dictionary
- `app/cantonese/cantodict.json` - Cantonese dictionary
- `app/chinese/zh.jieba.txt` - Jieba dictionary for Mandarin
- `app/cantonese/yue.jieba.txt` - Jieba dictionary for Cantonese

### Vietnamese

**Token Structure:**
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

**Features:**
- Longest-match suffix tokenization
- Vietnamese-English dictionary lookup
- Word-level meaning annotation
- Diacritic-aware text processing

**Files:**
- `main/handler/vietnamese.ts` - Main handler
- `app/vietnamese/vnedict.txt` - Vietnamese-English dictionary

## Adding a New Language (e.g., Thai, Korean)

### Step 1: Create Language Handler

Create `main/handler/[language].ts`:

```typescript
import {ipcMain} from "electron";
import path from "path";
import fs from "node:fs";

interface LanguageTokenResult {
  origin: string;
  [readingSystem]: string; // e.g., "romanization", "pronunciation"
  separation: { main: string; [readingSystem]?: string }[];
}

class LanguageName {
  static dictionary: Map<string, string> = new Map();
  static dictPath: string;
  static isLoaded = false;

  static getLanguageSettings = (appDataDirectory: string, replacements: any = {}) => {
    return {
      dictPath: path.join(__dirname, 'language/dict.txt'),
      ...replacements
    }
  }

  static async setup(settings: any) {
    try {
      this.dictPath = settings.dictPath;
      await this.loadDictionary();
      this.isLoaded = true;
      return null;
    } catch (e) {
      console.error('Language setup error:', e);
      return e.message;
    }
  }

  static async loadDictionary() {
    // Load your language-specific dictionary
    const data = fs.readFileSync(this.dictPath, 'utf-8');
    // Parse and populate this.dictionary
  }

  static tokenizeText(sentence: string): LanguageTokenResult[] {
    // Implement language-specific tokenization
    // Return array of tokens with proper structure
  }

  static registerLanguage() {
    ipcMain.handle('tokenizeUsingLanguage', async (event, sentence: string) => {
      if (!this.isLoaded) {
        throw new Error('Language dictionary not loaded');
      }
      return this.tokenizeText(sentence);
    });
  }

  static registerHandlers() {
    ipcMain.handle('queryLanguage', async (event, query: string, limit: number = 50) => {
      // Implement dictionary search
    });
  }
}

export default LanguageName;
```

### Step 2: Update Main Process Integration

**Update `main/background.ts`:**
```typescript
import LanguageName from "./handler/language";

// Add to imports and registration
LanguageName.registerHandlers();
LanguageName.registerLanguage();
```

**Update `main/handler/startup.ts`:**
```typescript
import LanguageName from "./language";

// Add language loader
ipcMain.handle('loadLanguage', async () => {
  setTokenizer('language');
  const error = await LanguageName.setup(LanguageName.getLanguageSettings(appDataDirectory))
  return {
    ok: error ? 0 : 1,
    message: error ?? 'Setup is ready'
  }
})
```

### Step 3: Update Renderer Integration

**Update `renderer/hooks/useLanguageManager.tsx`:**
```typescript
export const LANGUAGE_MODES: LanguageMode[] = [
  // ... existing languages
  {
    id: 5, // Next available ID
    name: 'Language Name',
    channel: 'loadLanguage',
    emoji: '🇹🇭', // Country flag
    description: 'Good luck! 🌟'
  }
];
```

**Update `renderer/utils/constants.ts`:**
```typescript
export const videoConstants = {
  // ... existing constants
  languageLang: 'th', // ISO 639-1 code
  varLang: {
    // ... existing
    "th": ["th"]
  },
  ocrLang: {
    // ... existing
    "th": "tha", // Tesseract language code
  }
}
```

**Update `renderer/hooks/useMiteiruTokenizer.tsx`:**
```typescript
const langMap = {
  // ... existing
  "language": videoConstants.languageLang
}

// Add tokenization case
} else if (tokenizerMode === "language") {
  res = await window.ipc.invoke('tokenizeUsingLanguage', sentence);
}
```

### Step 4: Update Subtitle Processing

**Update `renderer/components/Subtitle/DataStructures.ts`:**

Add learning method:
```typescript
async fillContentWithLearningLanguage(frequency) {
  this.meaning = Array(this.content.length).fill('');
  for (let i = 0; i < this.content.length; i++) {
    const word = this.content[i];
    const target = word.origin;
    frequency.set(target, (frequency.get(target) ?? 0) + 1);
    await window.ipc.invoke('queryLanguage', target, 3).then(val => {
      // Process dictionary results
    })
  }
}
```

Add adjust method:
```typescript
async adjustLanguage(tokenizeMiteiru: (string) => Promise<any[]>) {
  const promises = [];
  for (let i = 0; i < this.lines.length; i++) {
    if (globalSubtitleId !== this.id) return;
    const line = this.lines[i];
    promises.push(line.fillContentSeparations(tokenizeMiteiru));
    promises.push(line.fillContentWithLearningLanguage(this.frequency));
    this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
  }
  await Promise.all(promises);
  this.progress = 'done';
}
```

**Update subtitle rendering components:**

Update language detection in `renderer/components/Subtitle/Subtitle.tsx`:
```typescript
const isLanguageSentence = val.separation && !val.jyutping && !val.pinyin && !val.hiragana && val.romanization;
```

**Update `renderer/hooks/useLoadFiles.tsx`:**
```typescript
// Add to primary language check
|| tmpSub.language === videoConstants.languageLang

// Add processing
if (tmpSub.language === videoConstants.languageLang) {
  tmpSub.adjustLanguage(tokenizeMiteiru).then(() => {
    clearInterval(toastSetter);
    setFrequencyPrimary(tmpSub.frequency)
  })
}
```

### Step 5: Language-Specific Requirements

#### For Thai:
- **Tokenization**: Use Thai word segmentation (no spaces between words)
- **Script**: Thai script (อักษรไทย)
- **Reading System**: Romanization (RTGS)
- **Dictionary**: Thai-English dictionary
- **Special Considerations**: Tone marks, vowel positioning

#### For Korean:
- **Tokenization**: Morphological analysis (similar to Japanese)
- **Script**: Hangul + Hanja
- **Reading System**: Romanization (Revised Romanization)
- **Dictionary**: Korean-English dictionary
- **Special Considerations**: Honorifics, verb conjugations, agglutination

#### For Arabic:
- **Tokenization**: Root-based morphology
- **Script**: Arabic script (right-to-left)
- **Reading System**: Romanization (transliteration)
- **Dictionary**: Arabic-English dictionary
- **Special Considerations**: Diacritics, contextual letter forms

## Token Structure Requirements

All languages must return tokens with this structure:

```typescript
interface TokenResult {
  origin: string;                    // Original text
  [readingField]?: string;          // Language-specific reading (pinyin, hiragana, etc.)
  meaning?: string;                 // Translation/meaning (for dictionary-based languages)
  pos?: string;                     // Part of speech (optional)
  basicForm?: string;               // Lemma form (optional)
  separation: Array<{               // Character/syllable breakdown
    main: string;                   // Character/syllable
    [readingField]?: string;        // Reading for this unit
    meaning?: string;               // Meaning for this unit (optional)
    // Additional language-specific fields
  }>;
}
```

## File Organization Pattern

```
app/
├── [language]/
│   ├── dictionary.txt           # Main dictionary file
│   ├── [language].json         # Processed dictionary (if needed)
│   └── additional_data.txt     # Language-specific resources
│
main/handler/
├── [language].ts              # Main language handler
│
renderer/
├── hooks/
│   ├── useLanguageManager.tsx # Language selection
│   └── useMiteiruTokenizer.tsx # Tokenization integration
├── components/Subtitle/
│   ├── DataStructures.ts      # Subtitle processing
│   └── Subtitle.tsx          # Rendering logic
└── utils/
    └── constants.ts           # Language constants
```

## Testing New Language Implementation

1. **Language Selection**: Verify language appears in home screen
2. **Dictionary Loading**: Check dictionary loads without errors
3. **Tokenization**: Test text tokenization returns proper structure
4. **Subtitle Processing**: Load subtitles and verify tokenization works
5. **Dictionary Lookup**: Click words to verify dictionary search
6. **Learning Mode**: Test learning mode integration

## Common Pitfalls

1. **Token Structure**: Ensure `separation` array is properly formatted
2. **Character Encoding**: Use UTF-8 for all dictionary files
3. **Language Detection**: Update subtitle language detection logic
4. **Memory Management**: Large dictionaries should be loaded efficiently
5. **Error Handling**: Gracefully handle missing dictionaries or failed tokenization

## Performance Considerations

- **Dictionary Size**: Consider dictionary size vs. lookup speed trade-offs
- **Tokenization Speed**: Optimize tokenization algorithms for real-time use
- **Memory Usage**: Monitor memory usage with large dictionaries
- **Caching**: Implement caching for frequently accessed dictionary entries

---

This guide should help you implement support for new languages following the established patterns in Miteiru.
