import { LEARNING_LEVEL_LABELS } from '../components/VideoPlayer/vocabLevels';

/** The level a word gets when the subtitle's common-words rule marks it known by itself. */
export const AUTO_KNOWN_LEVEL = 3;

/** The levels a learner can save a word at, in the order the popup shows them. */
export const SAVE_LEVELS = [0, 1, 2].map((level) => ({ level, label: LEARNING_LEVEL_LABELS[level] }));

/** Whether a word is only "known" because it is common in this video, not because it was saved. */
export const isAutoKnown = (level: number): boolean => level === AUTO_KNOWN_LEVEL;

/** The saved level a word counts as: an automatically known word reads as Known. */
export const savedLevelOf = (level: number): number => (isAutoKnown(level) ? 2 : level);

/** The colour key: every level's dot and name, with the automatic one explained. */
export const COLOR_KEY = [
  { level: 0, label: 'New' },
  { level: 1, label: 'Learning' },
  { level: 2, label: 'Known' },
  { level: AUTO_KNOWN_LEVEL, label: 'Common in this video, treated as known' },
];
