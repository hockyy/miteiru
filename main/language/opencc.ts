/** Names of the five opencc-js 1.4.1 conversion chains used by Miteiru. */
export type OpenccMode = 't2s' | 's2t' | 's2hk' | 's2tw' | 'tw2s';

export function openccWireLine(text: string): string | number[] {
  // With Unicode matching, surrogate pairs are a single scalar outside this range.
  return /[\ud800-\udfff]/u.test(text) ? Array.from({length: text.length}, (_, i) => text.charCodeAt(i)) : text;
}
export function openccText(line: string | number[]): string {
  return typeof line === 'string' ? line : line.map(unit => String.fromCharCode(unit)).join('');
}
