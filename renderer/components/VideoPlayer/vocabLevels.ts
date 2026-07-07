import { defaultLearningColorStyling } from '../../utils/CJKStyling';

export const LEARNING_LEVEL_LABELS = ['New', 'Learning', 'Known', 'Mastered'] as const;

export const getLearningLevelLabel = (level: number) =>
  LEARNING_LEVEL_LABELS[level] ?? 'Unknown';

export const getLearningLevelColor = (level: number) =>
  defaultLearningColorStyling.learningColor[level]?.color ?? '#f3f3f3';

export const getLearningLevelHoverColor = (level: number) =>
  defaultLearningColorStyling.learningColor[level]?.hoverColor ?? '#a1a1a1';
