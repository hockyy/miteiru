import type {BoxTip} from '../../main/helpers/boxTips';
import {isEnglishLearningText} from './learningTextLanguage';

export const boxTipKey = (tip: BoxTip) => `${tip.from}:${tip.to}:${tip.title}`;

/** Analysis may look ahead, but a note belongs only to the cue currently on screen. */
export const currentBoxTipIndex = (tips: readonly BoxTip[], seconds: number, shiftMs = 0, dismissed: readonly string[] = []) => {
  if (!Number.isFinite(seconds)) return -1;
  const time = Math.trunc(seconds * 1000) - shiftMs;
  let low = 0;
  let high = tips.length - 1;
  let last = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (tips[middle].from <= time) { last = middle; low = middle + 1; }
    else high = middle - 1;
  }
  // Forecast cues are bounded to 90 seconds. Nearby overlaps can arise from clipped windows.
  for (let index = last; index >= 0 && tips[index].from >= time - 90_000; index--) {
    const tip = tips[index];
    if (time < tip.to && isEnglishLearningText(tip.text) && !dismissed.includes(boxTipKey(tip))) return index;
  }
  return -1;
};

/** Older cached notes also get a brief, word-boundary preview. New notes are generated this short. */
export function compactBoxTipText(text: string, maxWords = 18, maxCharacters = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentence = clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean;
  const words = sentence.split(' ');
  let short = words.slice(0, maxWords).join(' ');
  let clipped = words.length > maxWords;
  if (Array.from(short).length > maxCharacters) {
    short = Array.from(short).slice(0, maxCharacters - 1).join('');
    const boundary = short.lastIndexOf(' ');
    if (boundary > maxCharacters / 2) short = short.slice(0, boundary);
    clipped = true;
  }
  return clipped ? `${short.replace(/[\s,;:.!?…]+$/, '')}…` : short;
}
