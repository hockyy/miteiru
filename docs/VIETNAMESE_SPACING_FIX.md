# Vietnamese Spacing Fix

## Problem
Vietnamese compound words needed small spaces between each separation component for better readability.

## Solution
Modified the `ChineseSentence` component to automatically detect Vietnamese content and add small spaces between separation components.

## Implementation

### Detection Logic
```typescript
// Check if this is Vietnamese (no jyutping/pinyin but has separation with meaning)
const isVietnamese = separation.length > 0 && 
                     !separation.some(s => s.jyutping || s.pinyin) &&
                     separation.some(s => s.meaning !== undefined);
```

### Spacing Logic
```typescript
// For Vietnamese, add a small space between separation components (except spaces themselves)
if (isVietnamese && index < separation.length - 1 && val.main.trim() && separation[index + 1]?.main?.trim()) {
  return (
    <React.Fragment key={index}>
      {rubyElement}
      <span style={{ fontSize: '0.8em' }}> </span>
    </React.Fragment>
  );
}
```

## Result

### Vietnamese Compound Words
Words like "chỉ có" will now render with proper spacing between "chỉ" and "có":

**Before:** chỉcó
**After:** chỉ có

### Smart Spacing
- Only adds spaces between actual word components (not existing spaces)
- Uses smaller font size for visual balance
- Preserves existing spaces within compound dictionary entries
- Doesn't affect Chinese/Cantonese rendering

## Components Affected
- `ChineseSentence` - Primary fix
- `ScrollingLyrics` - Automatically benefits from ChineseSentence fix
- `Subtitle` component - Automatically benefits from ChineseSentence fix

This fix ensures Vietnamese text displays with proper readability while maintaining compatibility with Chinese and Cantonese rendering.
