# Miteiru Language Support

Miteiru is a multi-language subtitle learning application that supports various languages for video subtitle processing, tokenization, and dictionary lookup.

## Supported Languages

### 🇯🇵 Japanese
- **Tokenizers**: Kuromoji, MeCab (advanced morphological analyzers)
- **Features**: Furigana, Romaji, Advanced POS analysis, Verb conjugation, Mixed script handling
- **Dictionaries**: JMDict (Japanese-English), KanjiDic
- **Script Support**: Hiragana, Katakana, Kanji, Mixed compounds
- **Advanced Features**: 
  - Compound word recognition ("日本語" as single unit)
  - Inflection analysis ("見たよ" → base form "見る")
  - Counter word handling ("か月", "個", "人")
  - Particle classification and grammar analysis
  - Foreign text integration (numbers, English within Japanese)
- **Special Features**: Kanji stroke order, Wanikani integration

### 🇨🇳 Chinese (Mandarin)
- **Tokenizer**: Jieba
- **Features**: Pinyin pronunciation, Traditional/Simplified support
- **Dictionary**: CC-CEDICT
- **Script Support**: Simplified & Traditional Chinese
- **Special Features**: Tone numbers and symbols, Hanzi stroke order

### 🇭🇰 Cantonese  
- **Tokenizer**: Jieba (Cantonese variant)
- **Features**: Jyutping romanization, Tone symbols
- **Dictionary**: CC-Canto
- **Script Support**: Traditional Chinese
- **Special Features**: Cantonese-specific tone mapping

### 🇻🇳 Vietnamese
- **Tokenizer**: Longest-match suffix algorithm
- **Features**: Vietnamese-English translations, Diacritic support  
- **Dictionary**: VNEDict (54,375+ entries)
- **Script Support**: Vietnamese Latin script with diacritics
- **Special Features**: Word-level meaning annotation

## Language Selection

1. Launch Miteiru
2. Select your preferred language from the home screen:
   - **Kuromoji - Japanese** 🐣 - Fast Japanese tokenizer
   - **MeCab - Japanese** 👹 - Advanced Japanese tokenizer  
   - **Jieba - Cantonese** 🥘 - Cantonese with Jyutping
   - **Jieba - Chinese** 🐉 - Mandarin with Pinyin
   - **Vietnamese** 🇻🇳 - Vietnamese with English meanings

3. The selected language will be used for:
   - Subtitle tokenization and processing
   - Dictionary lookups when clicking words
   - Learning mode functionality
   - Automatic language detection for subtitle files

## Subtitle Language Detection

Miteiru automatically detects subtitle language based on filename:

- **Files with `.en.` in name** → English (secondary subtitle)
- **Files without `.en.` in name** → Selected app language (primary subtitle)

**Examples:**
- `movie.srt` → Native language (Vietnamese, Japanese, etc.)
- `movie.vi.srt` → Native language  
- `movie.en.srt` → English (secondary)
- `show.zh.srt` → Native language
- `show.en.srt` → English (secondary)

## Token Structure by Language

### Japanese (Kuromoji/MeCab)
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

### Chinese (Mandarin)
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

### Cantonese  
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

### Vietnamese
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

## Features by Language

| Feature | Japanese | Chinese | Cantonese | Vietnamese |
|---------|----------|---------|-----------|------------|
| Tokenization | ✅ Advanced | ✅ Jieba | ✅ Jieba | ✅ Dictionary |
| Pronunciation | ✅ Furigana | ✅ Pinyin | ✅ Jyutping | ❌ |
| Romanization | ✅ Romaji | ✅ Pinyin | ✅ Jyutping | ❌ |
| Dictionary | ✅ JMDict | ✅ CC-CEDICT | ✅ CC-Canto | ✅ VNEDict |
| Meanings | ✅ | ✅ | ✅ | ✅ |
| Grammar | ✅ POS Tags | ❌ | ❌ | ❌ |
| Learning Mode | ✅ | ✅ | ✅ | ✅ |
| Character Info | ✅ Kanji | ✅ Hanzi | ✅ Hanzi | ❌ |

## Learning Features

### Word Clicking
- Click any word to copy it and see dictionary definition
- Right-click to change learning state (for supported languages)
- Hover to see pronunciation/meaning tooltips

### Learning States
- **State 0** (New): Red highlighting
- **State 1** (Learning): Orange highlighting  
- **State 2** (Known): Green highlighting
- **State 3** (Mastered): Blue highlighting

### Frequency Tracking
All languages track word frequency across subtitles for learning prioritization.

### Dictionary Integration
Each language provides integrated dictionary lookup:
- **Japanese**: JMDict with full definitions
- **Chinese**: CC-CEDICT with English meanings
- **Cantonese**: CC-Canto with definitions  
- **Vietnamese**: VNEDict with English translations

## Technical Implementation

### Architecture
- **Main Process**: Language handlers for tokenization and dictionary
- **Renderer Process**: UI components and subtitle rendering
- **IPC Communication**: Electron IPC for tokenization requests
- **Dictionary Storage**: Local dictionary files for offline use

### Performance
- Dictionaries loaded on language selection
- Tokenization optimized for real-time subtitle processing
- Caching for frequently accessed dictionary entries
- Efficient data structures for fast lookups

## Adding New Languages

See [Language Implementation Guide](docs/LANGUAGE_IMPLEMENTATION.md) for detailed instructions on adding support for additional languages like Thai, Korean, Arabic, etc.

## Troubleshooting

### Dictionary Not Loading
1. Check if language dictionary files exist in `app/[language]/` directory
2. Verify file encoding is UTF-8
3. Check console for loading errors

### Tokenization Issues  
1. Ensure language is properly selected on home screen
2. Check subtitle file encoding
3. Verify subtitle language detection is working correctly

### Performance Issues
1. Large dictionary files may cause slower startup
2. Very long subtitle lines may impact tokenization speed
3. Consider breaking up extremely long subtitle files

---

For more technical details, see the [Language Implementation Guide](docs/LANGUAGE_IMPLEMENTATION.md) and [Vietnamese Implementation Details](docs/VIETNAMESE_IMPLEMENTATION.md).
