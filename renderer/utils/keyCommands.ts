import {mainSubtitleNameInSentence} from "./subtitleLabels";

/** A video-page shortcut: what it is called, which key runs it, and where it is grouped. */
export type KeyCommand<Id extends string = string> = {
  id: Id;
  commandName: string;
  /** A letter, or a key name (`Escape`, `Backspace`). */
  currentKey: string;
  modifiers: string[];
  category: string;
};

export type KeyCommandId =
  | 'close-meaning' | 'meaning-back' | 'clear-meaning'
  | 'go-home' | 'go-learn' | 'go-flash'
  | 'open-files' | 'search-lyrics'
  | 'toggle-controller' | 'toggle-sidebar' | 'toggle-vocab-sidebar'
  | 'toggle-furigana' | 'toggle-primary-sub' | 'toggle-secondary-sub' | 'reload-subtitles'
  | 'open-google-translate' | 'open-deepl'
  | 'copy-ruby' | 'copy-content';

/**
 * Every shortcut of the video page, by id. `useKeyBind` attaches the actions, and the command palette
 * and the shortcut sheet read the same list, so none of them can drift from the keys.
 * Names are plain words: they are what the learner reads. `languageName` is the language being learned.
 */
export const keyCommandDefinitions = (languageName: string = 'main'): KeyCommand<KeyCommandId>[] => [
  {id: 'close-meaning', commandName: 'Close the word popup', currentKey: 'Escape', modifiers: [], category: 'Word popup'},
  {id: 'meaning-back', commandName: 'Back to the previous word in the popup', currentKey: 'Backspace', modifiers: [], category: 'Word popup'},
  {id: 'clear-meaning', commandName: 'Close the word popup', currentKey: 'H', modifiers: [], category: 'Word popup'},
  {id: 'go-home', commandName: 'Go to Home', currentKey: 'H', modifiers: ['Ctrl'], category: 'Go to'},
  {id: 'go-learn', commandName: 'Open Study a text (leaves the video)', currentKey: 'L', modifiers: ['Ctrl', 'Shift'], category: 'Go to'},
  {id: 'go-flash', commandName: 'Open Flashcards (leaves the video)', currentKey: 'K', modifiers: ['Ctrl', 'Shift'], category: 'Go to'},
  {id: 'open-files', commandName: 'Open video or subtitles…', currentKey: 'O', modifiers: ['Ctrl'], category: 'Video'},
  {id: 'search-lyrics', commandName: 'Find lyrics online (LRCLIB)', currentKey: 'M', modifiers: [], category: 'Video'},
  {id: 'toggle-controller', commandName: 'Show or hide the video controls', currentKey: 'Z', modifiers: [], category: 'Panels'},
  {id: 'toggle-sidebar', commandName: 'Open or close video settings', currentKey: 'X', modifiers: [], category: 'Panels'},
  {id: 'toggle-vocab-sidebar', commandName: 'Open or close My words', currentKey: 'X', modifiers: ['Ctrl'], category: 'Panels'},
  {id: 'toggle-furigana', commandName: 'Show or hide the reading above words', currentKey: 'Y', modifiers: [], category: 'Subtitles'},
  {id: 'toggle-primary-sub', commandName: `Show or hide the ${mainSubtitleNameInSentence(languageName)}`, currentKey: 'O', modifiers: [], category: 'Subtitles'},
  {id: 'toggle-secondary-sub', commandName: 'Show or hide the translation', currentKey: 'P', modifiers: [], category: 'Subtitles'},
  {id: 'reload-subtitles', commandName: 'Load both subtitles again', currentKey: 'A', modifiers: [], category: 'Subtitles'},
  {id: 'open-google-translate', commandName: 'Translate the line in Google Translate', currentKey: 'G', modifiers: [], category: 'Look up'},
  {id: 'open-deepl', commandName: 'Translate the line in DeepL', currentKey: 'T', modifiers: [], category: 'Look up'},
  {id: 'copy-ruby', commandName: 'Copy the line with its readings', currentKey: 'C', modifiers: [], category: 'Copy'},
  {id: 'copy-content', commandName: 'Copy the line as plain text', currentKey: 'C', modifiers: ['Shift'], category: 'Copy'},
];
