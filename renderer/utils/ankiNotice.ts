/** The file name of a path, whichever separator it uses. */
export const fileNameOf = (filePath: string): string =>
  filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;

/** What to tell the learner once an Anki import file is saved. */
export const ankiSavedMessage = (filePath: string): string =>
  `Saved ${fileNameOf(filePath)} · In Anki: File → Import, then pick this file`;
