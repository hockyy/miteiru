# Token Structure Reference

Quick reference for token structures returned by each language's tokenizer.

## Japanese (Kuromoji/MeCab)

**Rich morphological analysis with readings and grammar:**

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

**Inflected verb with particles:**
```json
{
    "origin": "見たよ",
    "hiragana": "みたよ",
    "basicForm": "見る",
    "pos": "動詞-自立",
    "separation": [
        {
            "main": "見",
            "hiragana": "み",
            "romaji": "mi",
            "isKana": false,
            "isKanji": true,
            "isMixed": false
        },
        {
            "main": "た",
            "hiragana": "た",
            "romaji": "ta",
            "isKana": true,
            "isKanji": false,
            "isMixed": false
        },
        {
            "main": "よ",
            "hiragana": "よ",
            "romaji": "yo",
            "isKana": true,
            "isKanji": false,
            "isMixed": false
        }
    ]
}
```

**Counter word (mixed script):**
```json
{
    "origin": "か月",
    "hiragana": "かげつ",
    "basicForm": "か月",
    "pos": "名詞-接尾-助数詞",
    "separation": [
        {
            "main": "か",
            "hiragana": "か",
            "romaji": "ka",
            "isKana": true,
            "isKanji": false,
            "isMixed": false
        },
        {
            "main": "月",
            "hiragana": "げつ",
            "romaji": "getsu",
            "isKana": false,
            "isKanji": true,
            "isMixed": false
        }
    ]
}
```

**Compound word preservation:**
```json
{
    "origin": "日本語",
    "hiragana": "にほんご",
    "basicForm": "日本語",
    "pos": "名詞-一般",
    "separation": [
        {
            "main": "日本語",
            "hiragana": "にほんご",
            "romaji": "nihongo",
            "isKana": false,
            "isKanji": true,
            "isMixed": false
        }
    ]
}
```

## Chinese (Mandarin)

**Pinyin pronunciation with tone marks:**

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

**Multi-character word:**
```json
{
    "origin": "叫做",
    "pinyin": "jiào zuò",
    "separation": [
        {
            "main": "叫",
            "pinyin": "jiào"
        },
        {
            "main": "做", 
            "pinyin": "zuò"
        }
    ]
}
```

**Non-Chinese text:**
```json
{
    "origin": "Peppa",
    "pinyin": "    ",
    "separation": [
        {
            "main": "P",
            "pinyin": ""
        },
        {
            "main": "e",
            "pinyin": ""
        },
        {
            "main": "p",
            "pinyin": ""
        },
        {
            "main": "p", 
            "pinyin": ""
        },
        {
            "main": "a",
            "pinyin": ""
        }
    ]
}
```

## Cantonese

**Jyutping romanization with tone symbols:**

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

**Multi-character word:**
```json
{
    "origin": "就係",
    "jyutping": "zauˍ₆ haiˍ₆",
    "separation": [
        {
            "main": "就",
            "jyutping": "zauˍ₆"
        },
        {
            "main": "係",
            "jyutping": "haiˍ₆" 
        }
    ]
}
```

**Tone symbol mapping:**
- `ˉ¹` - Tone 1 (high level)
- `⸍²` - Tone 2 (high rising)  
- `-₃` - Tone 3 (mid level)
- `⸜₄` - Tone 4 (low falling)
- `⸝₅` - Tone 5 (low rising)
- `ˍ₆` - Tone 6 (low level)

## Vietnamese

**Dictionary-based meanings with word separation:**

```json
{
    "origin": "Việt Nam",
    "meaning": "Vietnam, Vietnamese",
    "separation": [
        { 
            "main": "Việt", 
            "meaning": "Vietnam, Vietnamese" 
        },
        { 
            "main": " " 
        },
        { 
            "main": "Nam", 
            "meaning": "Vietnam, Vietnamese" 
        }
    ]
}
```

**Single character (no dictionary match):**
```json
{
    "origin": "dài",
    "meaning": "long; to last (time)",
    "separation": [
        {
            "main": "dài",
            "meaning": "long; to last (time)"
        }
    ]
}
```

**Punctuation and spaces:**
```json
{
    "origin": ",",
    "meaning": "",
    "separation": [
        {
            "main": ","
        }
    ]
}
```

## Common Patterns

### Required Fields for All Languages
```json
{
    "origin": "original_text",        // Always required
    "separation": [                   // Always required array
        {
            "main": "character/word"  // Always required in separation
        }
    ]
}
```

### Language-Specific Reading Fields
- **Japanese**: `hiragana`, `romaji` in separation
- **Chinese**: `pinyin` at token and separation level
- **Cantonese**: `jyutping` at token and separation level  
- **Vietnamese**: `meaning` at token and separation level

### Optional Fields
- `basicForm` - Lemma/dictionary form (Japanese)
- `pos` - Part of speech tag (Japanese)
- `meaning` - Translation (Vietnamese, used in learning)

### Whitespace and Punctuation
All languages handle whitespace and punctuation by creating separate tokens:

```json
{
    "origin": " ",
    "[reading_field]": "",
    "separation": [
        {
            "main": " ",
            "[reading_field]": null
        }
    ]
}
```

### Foreign Text in Native Context
When foreign text appears (like "Peppa" in Chinese), it gets character-by-character breakdown:

```json
{
    "origin": "Peppa",
    "[reading_field]": "     ",  // Empty readings
    "separation": [
        {"main": "P", "[reading_field]": ""},
        {"main": "e", "[reading_field]": ""},
        {"main": "p", "[reading_field]": ""},
        {"main": "p", "[reading_field]": ""},
        {"main": "a", "[reading_field]": ""}
    ]
}
```

## Token Array Examples

### Typical Sentence Structure
A complete sentence is tokenized into an array of tokens:

```json
[
    {"origin": "我", "pinyin": "wǒ", "separation": [...]},
    {"origin": "叫做", "pinyin": "jiào zuò", "separation": [...]},
    {"origin": "Peppa", "pinyin": "    ", "separation": [...]},
    {"origin": ",", "pinyin": "", "separation": [...]}
]
```

### Rendering Logic
The renderer determines language type by checking for specific fields:
- **Japanese**: `hiragana !== undefined`
- **Chinese**: `pinyin` exists (and not `jyutping`)
- **Cantonese**: `jyutping` exists  
- **Vietnamese**: `separation` exists without `jyutping`, `pinyin`, or `hiragana`

This structure allows the subtitle system to properly render readings, handle clicks, show tooltips, and integrate with the learning system across all supported languages.

## Advanced Japanese Analysis

Japanese tokenization demonstrates the most sophisticated morphological analysis:

- **Verb Conjugations**: `見たよ` (saw + particle) → base form `見る` (to see)
- **Mixed Scripts**: `か月` combining hiragana counter + kanji unit  
- **Compound Preservation**: `日本語` kept as semantic unit despite multiple kanji
- **Grammar Recognition**: Detailed POS tags for particles, verbs, nouns, counters
- **Foreign Integration**: Numbers and Latin text handled appropriately

For detailed Japanese tokenization examples, see [Japanese Tokenization Examples](JAPANESE_TOKENIZATION_EXAMPLES.md).
