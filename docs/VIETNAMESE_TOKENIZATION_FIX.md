# Vietnamese Tokenization Spacing Fix

## Problem Description

Vietnamese tokenization was creating problematic output with spacing issues:

### Issue 1: Standalone Space Tokens
```json
{
    "origin": " ",
    "meaning": "",
    "separation": [
        {
            "main": " " // Empty main character causing rendering issues
        }
    ]
}
```

### Issue 2: Lost Spacing in Compound Words
Compound words like "chỉ có" were being separated properly but spacing wasn't preserved during rendering.

## Root Cause

The original tokenizer was creating separate tokens for every unmatched character, including spaces. This caused:

1. **Empty main elements** - Standalone spaces became separate tokens
2. **Rendering issues** - Empty ruby elements in the subtitle display
3. **Visual spacing problems** - Lost whitespace between words

## Solution

### Tokenizer Fix

**Before:**
```typescript
if (!matched) {
  const char = sentence[i];
  if (char.trim() || /[^\s]/.test(char)) { 
    result.push({
      origin: char,
      meaning: '',
      separation: [{ main: char }]
    });
  }
  i += 1;
}
```

**After:**
```typescript
if (!matched) {
  const char = sentence[i];
  // Skip standalone spaces completely - they'll be preserved within compound words
  if (char !== ' ') {
    result.push({
      origin: char,
      meaning: '',
      separation: [{ main: char }]
    });
  }
  i += 1;
}
```

### Key Changes

1. **Skip standalone spaces** - Don't create separate tokens for spaces between words
2. **Preserve compound word spacing** - Spaces within dictionary entries are maintained in separation arrays
3. **Clean filtering** - Use `words.filter(word => word.length > 0)` to remove empty strings from separation

## Result

### Before Fix:
```json
[
    {"origin": "anh", "separation": [{"main": "anh", "meaning": "..."}]},
    {"origin": " ", "separation": [{"main": " "}]}, // ❌ Problematic
    {"origin": "chỉ có", "separation": [
        {"main": "chỉ", "meaning": "..."},
        {"main": " "},
        {"main": "có", "meaning": "..."}
    ]},
    {"origin": " ", "separation": [{"main": " "}]} // ❌ Problematic
]
```

### After Fix:
```json
[
    {"origin": "anh", "separation": [{"main": "anh", "meaning": "..."}]},
    {"origin": "chỉ có", "separation": [
        {"main": "chỉ", "meaning": "..."},
        {"main": " "}, // ✅ Preserved within compound
        {"main": "có", "meaning": "..."}
    ]},
    {"origin": "tiền", "separation": [{"main": "tiền", "meaning": "..."}]}
]
```

## Benefits

1. **No empty main elements** - Cleaner token structure
2. **Preserved spacing** - Compound words maintain proper spacing
3. **Better rendering** - No empty ruby elements in subtitles
4. **Consistent display** - Vietnamese words appear with correct spacing

## Technical Details

- **Longest-match algorithm** still functions correctly
- **Dictionary lookup** remains unchanged
- **Separation logic** improved with better filtering
- **Rendering compatibility** maintained with existing ChineseSentence component

This fix resolves both major Vietnamese tokenization issues while maintaining the sophisticated longest-match parsing algorithm.
