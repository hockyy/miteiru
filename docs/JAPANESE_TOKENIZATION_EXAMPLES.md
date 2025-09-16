# Japanese Tokenization Examples

This document showcases the advanced capabilities of Japanese morphological analysis in Miteiru.

## Advanced Features Demonstrated

### 1. Verb Conjugation Analysis

**Input**: `見たよ` (mita yo - "I saw it")

**Analysis**:
- **Base form identification**: `見る` (miru - "to see")  
- **Tense analysis**: Past tense form
- **Particle handling**: `よ` (yo - emphasis particle)
- **Mixed script**: Kanji stem + hiragana inflection + hiragana particle

```json
{
    "origin": "見たよ",
    "hiragana": "みたよ",
    "basicForm": "見る",
    "pos": "動詞-自立",
    "separation": [
        {"main": "見", "hiragana": "み", "romaji": "mi", "isKanji": true},
        {"main": "た", "hiragana": "た", "romaji": "ta", "isKana": true},
        {"main": "よ", "hiragana": "よ", "romaji": "yo", "isKana": true}
    ]
}
```

### 2. Counter Words and Units

**Input**: `か月` (kagetsu - "months")

**Analysis**:
- **Counter recognition**: Japanese counting system
- **Mixed script handling**: Hiragana + Kanji
- **Semantic unity**: Treated as single meaningful unit

```json
{
    "origin": "か月",
    "hiragana": "かげつ", 
    "basicForm": "か月",
    "pos": "名詞-接尾-助数詞",
    "separation": [
        {"main": "か", "hiragana": "か", "romaji": "ka", "isKana": true},
        {"main": "月", "hiragana": "げつ", "romaji": "getsu", "isKanji": true}
    ]
}
```

### 3. Compound Word Recognition

**Input**: `日本語` (nihongo - "Japanese language")

**Analysis**:
- **Compound preservation**: Three kanji treated as single semantic unit
- **Reading unification**: Single reading for entire compound
- **Semantic integrity**: Maintains meaning as complete word

```json
{
    "origin": "日本語",
    "hiragana": "にほんご",
    "basicForm": "日本語", 
    "pos": "名詞-一般",
    "separation": [
        {"main": "日本語", "hiragana": "にほんご", "romaji": "nihongo", "isKanji": true}
    ]
}
```

### 4. Particle Chain Analysis

**Input**: `ねねねね` (ne ne ne ne - repetitive particles)

**Analysis**:
- **Individual particle recognition**: Each `ね` identified separately
- **Grammatical classification**: Sentence-ending particles
- **Repetition handling**: Natural speech patterns preserved

```json
[
    {"origin": "ね", "hiragana": "ね", "pos": "助詞-終助詞", ...},
    {"origin": "ね", "hiragana": "ね", "pos": "助詞-終助詞", ...},
    {"origin": "ね", "hiragana": "ね", "pos": "助詞-終助詞", ...},
    {"origin": "ね", "hiragana": "ね", "pos": "助詞-終助詞", ...}
]
```

### 5. Foreign Text Integration

**Input**: `1480` (numbers) and `NH` (acronym)

**Analysis**:
- **Non-Japanese recognition**: Identified as foreign elements
- **No reading assignment**: Empty hiragana/romaji fields
- **Appropriate classification**: Numbers vs general nouns

```json
{
    "origin": "1480",
    "hiragana": "",
    "basicForm": "*", 
    "pos": "名詞-数",
    "separation": [
        {"main": "1480", "hiragana": "", "romaji": "", "isKanji": false, "isKana": false}
    ]
}
```

### 6. Complex Sentence Analysis

**Input**: `日本語の森の方本屋` (nihongo no mori no hou hon'ya)

**Token Breakdown**:
1. `日本語` - Compound noun (Japanese language)
2. `の` - Genitive particle  
3. `森` - Simple noun (forest)
4. `の` - Genitive particle
5. `方` - Directional noun (direction/side)
6. `本屋` - Compound noun (bookstore)

**Demonstrates**:
- **Particle separation**: Proper grammatical boundaries
- **Compound recognition**: Multi-kanji words kept intact
- **Contextual analysis**: Each token properly classified

## Part-of-Speech Categories

Japanese morphological analysis includes detailed POS tags:

- **名詞-一般** - General nouns
- **名詞-数** - Numbers
- **名詞-接尾-助数詞** - Counter words  
- **動詞-自立** - Independent verbs
- **助詞-終助詞** - Sentence-ending particles
- **助詞-連体化** - Adnominal particles
- **フィラー** - Filler words/interjections

## Character Classification

Each character is classified by script type:

- **isKanji**: Chinese characters (漢字)
- **isKana**: Hiragana/Katakana (ひらがな・カタカナ)  
- **isMixed**: Tokens containing both scripts
- **Foreign**: Numbers, Latin alphabet, punctuation

## Learning Integration

These advanced features enable sophisticated learning:

1. **Grammar Analysis**: Understand verb forms and particles
2. **Vocabulary Building**: Recognize compound vs simple words
3. **Reading Practice**: Furigana for difficult kanji
4. **Contextual Learning**: See how words function in sentences
5. **Frequency Tracking**: Learn from real usage patterns

## Comparison with Other Languages

| Feature | Japanese | Chinese | Vietnamese |
|---------|----------|---------|------------|
| **Script Complexity** | 3 scripts + mixed | 1 script | 1 script |
| **Morphology** | Rich inflection | Minimal | None |
| **Compound Analysis** | Advanced | Basic | None |
| **Grammar Tags** | 40+ categories | None | None |
| **Reading Systems** | 2 (Hiragana + Romaji) | 1 (Pinyin) | None |
| **Foreign Text** | Integrated | Character-level | Character-level |

This demonstrates why Japanese requires the most sophisticated tokenization system among all supported languages in Miteiru.
