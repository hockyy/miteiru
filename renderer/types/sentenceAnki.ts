/** JSON shape for AI-generated sentence Anki back content. Schema: utils/aiAnkiPrompts.ts */
export interface SentenceAnkiBackContent {
  translation: string;
  note: string;
}

export const emptySentenceAnkiBackContent = (): SentenceAnkiBackContent => ({
  translation: '',
  note: '',
});

/** Editable sentence card draft shown in the Anki builder panel before export. */
export interface SentenceAnkiDraft {
  sourceSentence: string;
  frontText: string;
  rubyHtml: string;
  translation: string;
  note: string;
  lang: string;
  deckName: string;
  cardId: string;
}
