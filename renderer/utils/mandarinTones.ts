import type {MandarinTone} from '../../main/language/mandarinTones';

/** Tone reading and sandhi live in main/language/mandarinTones.ts, which the language tools use too. */
export * from '../../main/language/mandarinTones';

export type ToneTarget = 'hanzi' | 'pinyin' | 'both';
export type TonePalette = 'default' | 'accessible';

/** Bright on video with the subtitle's existing dark outline. Neutral is always grey. */
export const MANDARIN_TONE_PALETTES: Record<TonePalette, Record<MandarinTone, string>> = {
  default: {1: '#ff8080', 2: '#ffda70', 3: '#86e6a4', 4: '#8abaff', 5: '#cbd5e1'},
  // Okabe–Ito colours, with a light grey neutral tone.
  accessible: {1: '#e69f00', 2: '#56b4e9', 3: '#009e73', 4: '#cc79a7', 5: '#cbd5e1'},
};

export const mandarinToneColor = (tone: MandarinTone | null | undefined, palette: TonePalette = 'default') =>
  tone ? (MANDARIN_TONE_PALETTES[palette] ?? MANDARIN_TONE_PALETTES.default)[tone] : undefined;
