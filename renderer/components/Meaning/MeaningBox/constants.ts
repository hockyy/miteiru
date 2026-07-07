import { defaultLearningColorStyling } from '../../../utils/CJKStyling';
import type { CharacterContentState, MeaningContentState } from './types';

export const INITIAL_MEANING_CONTENT: MeaningContentState = {
  id: '',
  sense: [],
  single: [],
  content: '',
  simplified: '',
};

export const INITIAL_CHARACTER_CONTENT: CharacterContentState = { literal: null };

export const MEANING_KANJI_CLASS = 'unselectable meaning-kanji text-md';

export const COPY_BUTTON_CLASS =
  'border border-blue-600 bg-yellow-100 font-bold text-blue-900 hover:bg-yellow-200';

/** Learning-state star colors (0 = unknown … n = mastered). */
export const getStarColor = (learningState: number) =>
  defaultLearningColorStyling.learningColor[learningState].color;
