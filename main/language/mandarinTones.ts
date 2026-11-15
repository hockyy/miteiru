/**
 * Mandarin tones: the tone of a pinyin syllable, and the tones a line is spoken with after tone sandhi
 * (一, 不, 3+3). Shared by the subtitles' tone colours (renderer/utils/mandarinTones.ts) and the
 * language tools (main/mcp/languageTools.ts).
 */
export type MandarinTone = 1 | 2 | 3 | 4 | 5;


/** Reads both pinyin modes the app displays: nǐ and niᵛ₃, plus plain ni3/ma0. */
export const pinyinTone = (reading: string): MandarinTone | null => {
  const value = reading.trim().normalize('NFD');
  if (!value || !/^[a-züv:ê\u0300-\u036f]+(?:[0-5¹²₃₄₅ˉ⸍ᵛ⸌·]*)$/i.test(value)) return null;
  const number = value.match(/([0-5¹²₃₄₅])$/)?.[1];
  if (number) return ({'0': 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '¹': 1, '²': 2, '₃': 3, '₄': 4, '₅': 5} as const)[number];
  for (const [mark, tone] of [['\u0304', 1], ['\u0301', 2], ['\u030c', 3], ['\u0300', 4]] as const) {
    if (value.includes(mark)) return tone;
  }
  return 5;
};

export interface MandarinPart {main: string; pinyin?: string; jyutping?: string | null}

export interface MandarinToken {separation?: MandarinPart[]}

/**
 * One tone per existing ruby part. A non-Hanzi part, punctuation or missing reading is a boundary.
 * 一/不 see the next syllable across word boundaries in this line; 3+3 changes only inside a word.
 * Read the original tones on each pass, so 3+3+3 becomes 2+2+3 rather than cascading backwards.
 */
export const mandarinSpokenTones = (tokens: readonly MandarinToken[]): (MandarinTone | null)[][] => {
  const words = tokens.map((token, word) => (token.separation ?? []).map((part, at, parts) => ({
    char: part.main,
    word,
    // 一 ending a longer word (统一, 唯一, 之一) is a number, not a counter, and keeps yī.
    endsWord: parts.length > 1 && at === parts.length - 1,
    tone: /^\p{Script=Han}$/u.test(part.main) && !part.jyutping ? pinyinTone(part.pinyin ?? '') : null,
  })));
  const syllables = words.flat();
  const spoken = syllables.map((part, index) => {
    const next = syllables[index + 1];
    if (!part.tone || !next?.tone) return part.tone;
    if (part.char === '不' && part.tone === 4 && next.tone === 4) return 2;
    // Ordinals keep yī too: 第一次 is dì yī cì.
    if (part.char === '一' && part.tone === 1 && !part.endsWord && syllables[index - 1]?.char !== '第') {
      if (next.tone === 4) return 2;
      if (next.tone < 4) return 4;
    }
    if (part.tone === 3 && next.tone === 3 && part.word === next.word) return 2;
    return part.tone;
  });
  let offset = 0;
  return words.map((word) => {const result = spoken.slice(offset, offset + word.length); offset += word.length; return result;});
};
