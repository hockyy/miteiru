import type { ReactNode } from 'react';
import type { defaultMeaningBoxStyling } from '../../../utils/CJKStyling';

/** Horizontal inset when sidebars are open (keeps the modal visible between panels). */
export type SidebarInsets = {
  left?: string;
  right?: string;
};

export type MeaningBoxProps = {
  meaning: string;
  setMeaning: (value: string) => void;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
  subtitleStyling?: typeof defaultMeaningBoxStyling;
  customComponent?: ReactNode;
  lang: string;
  changeLearningState?: ((term: string) => void) | null;
  getLearningState?: ((term: string) => number) | null;
  showMeaning?: boolean;
  sidebarInsets?: SidebarInsets;
};

/** Dictionary payload shape returned by `getMeaningEntries`. */
export type MeaningContentState = {
  id: string;
  sense: SenseEntry[];
  single: { key: number; text: string }[];
  content: string;
  simplified: string;
  meaning?: string | string[];
  jyutping?: string;
  comments?: string;
};

export type SenseEntry = {
  partOfSpeech: string[];
  gloss: { text: string }[];
};

export type CharacterContentState = {
  literal: string | null;
  [key: string]: unknown;
};

export type RomajiedGroup = {
  key: number;
  romajied: RomajiedToken[];
};

export type RomajiedToken = {
  origin: string;
  separation?: unknown;
  pinyin?: string;
  jyutping?: string;
};
