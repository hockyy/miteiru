export type MandarinTone = 1 | 2 | 3 | 4 | 5;
export type ToneTarget = 'hanzi' | 'pinyin' | 'both';
export type TonePalette = 'default' | 'accessible';

/** Bright on video with the subtitle's existing dark outline. Neutral is always grey. */
export const MANDARIN_TONE_PALETTES: Record<TonePalette, Record<MandarinTone, string>> = {
  default: {1: '#ff8080', 2: '#ffda70', 3: '#86e6a4', 4: '#8abaff', 5: '#cbd5e1'},
  // Okabe–Ito colours, with a light grey neutral tone.
  accessible: {1: '#e69f00', 2: '#56b4e9', 3: '#009e73', 4: '#cc79a7', 5: '#cbd5e1'},
};

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
  const words = tokens.map((token, word) => (token.separation ?? []).map((part) => ({
    char: part.main,
    word,
    tone: /^\p{Script=Han}$/u.test(part.main) && !part.jyutping ? pinyinTone(part.pinyin ?? '') : null,
  })));
  const syllables = words.flat();
  const spoken = syllables.map((part, index) => {
    const next = syllables[index + 1];
    if (!part.tone || !next?.tone) return part.tone;
    if (part.char === '不' && part.tone === 4 && next.tone === 4) return 2;
    if (part.char === '一' && part.tone === 1) {
      if (next.tone === 4) return 2;
      if (next.tone < 4) return 4;
    }
    if (part.tone === 3 && next.tone === 3 && part.word === next.word) return 2;
    return part.tone;
  });
  let offset = 0;
  return words.map((word) => {const result = spoken.slice(offset, offset + word.length); offset += word.length; return result;});
};

export const mandarinToneColor = (tone: MandarinTone | null | undefined, palette: TonePalette = 'default') =>
  tone ? (MANDARIN_TONE_PALETTES[palette] ?? MANDARIN_TONE_PALETTES.default)[tone] : undefined;
