import type { ReactNode } from 'react';
import type { defaultMeaningBoxStyling } from '../../../utils/CJKStyling';
import type {UserDictionaryProvenance} from '../userDictionaryProvenance';

/** Horizontal inset when sidebars are open (keeps the modal visible between panels). */
export type SidebarInsets = {
  left?: string;
  right?: string;
  // Space kept clear above the panel (the Flashcards header).
  top?: string;
};

export type MeaningBoxProps = {
  meaning: string;
  setMeaning: (value: string) => void;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
  subtitleStyling?: typeof defaultMeaningBoxStyling;
  customComponent?: ReactNode;
  lang: string;
  /** Saves a word at a chosen level (0 New, 1 Learning, 2 Known); the header's three-part control uses it. */
  setLearningLevel?: ((term: string, level: number) => void) | null;
  getLearningState?: ((term: string) => number) | null;
  showMeaning?: boolean;
  hskEnabled?: boolean;
  sidebarInsets?: SidebarInsets;
  /** Steps back to the previous word; shown as "← Back" when given. */
  onBack?: (() => void) | null;
  /** Shows a "Close (Esc)" button (the pages where Esc closes the popup). */
  showCloseButton?: boolean;
  /** The key that copies the whole sentence on this page ("C", "Ctrl+G"); the hint is left out when unset. */
  sentenceCopyKey?: string | null;
};

/** Dictionary payload shape returned by `getMeaningEntries`. */
export type MeaningContentState = {
  id: string;
  sense: SenseEntry[];
  /** `reading` is the dictionary's own kana for a Japanese headword. */
  single: { key: number; text: string; reading?: string }[];
  content: string;
  simplified: string;
  meaning?: string | string[];
  jyutping?: string | string[];
  comments?: string;
  /** Set on the placeholder entry `getMeaningEntries` returns when the dictionary has no match. */
  notFound?: boolean;
  userDictionary?: UserDictionaryProvenance;
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
