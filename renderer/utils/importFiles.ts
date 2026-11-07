/**
 * Reading the files a learner imports from the video settings (learning progress, subtitle style),
 * and what to tell them about the result. Pure, so a wrong file gets a message instead of silence.
 */

export const NOT_PROGRESS_FILE_MESSAGE = "That file isn't a Miteiru progress file";
export const NOT_STYLE_FILE_MESSAGE = "That file isn't a Miteiru subtitle style file";

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** A saved word: a level number (old files), or an entry with a level and when it changed. */
const isWordEntry = (value: unknown): boolean => (
  (typeof value === "number" && Number.isFinite(value)) ||
  (isPlainObject(value) && typeof value.level === "number" && Number.isFinite(value.level))
);

export type ProgressImport =
  | { kind: "cancelled" }
  | { kind: "invalid" }
  | { kind: "ok"; words: Record<string, unknown>; count: number };

/**
 * The words in a learning progress file. An empty text is the file picker being closed; anything that
 * is not a list of saved words is invalid (a subtitle style file, say, which is also JSON).
 */
export const parseProgressFile = (text: string): ProgressImport => {
  if (!text) return {kind: "cancelled"};
  const parsed = parseJson(text);
  if (!isPlainObject(parsed)) return {kind: "invalid"};
  const entries = Object.entries(parsed);
  if (entries.length === 0) return {kind: "ok", words: {}, count: 0};
  const words = Object.fromEntries(entries.filter(([, value]) => isWordEntry(value)));
  const count = Object.keys(words).length;
  return count === 0 ? {kind: "invalid"} : {kind: "ok", words, count};
};

/** "Loaded 132 words". */
export const progressImportedMessage = (count: number): string => (
  `Loaded ${count} ${count === 1 ? "word" : "words"}`
);

export type StyleImport<T> =
  | { kind: "cancelled" }
  | { kind: "invalid" }
  | { kind: "ok"; style: T };

/** A subtitle style from a file: it must have the text and outline settings; missing ones keep their defaults. */
export const parseStyleFile = <T extends object>(text: string, defaults: T): StyleImport<T> => {
  if (!text) return {kind: "cancelled"};
  const parsed = parseJson(text);
  if (!isPlainObject(parsed) || !isPlainObject(parsed.text) || !isPlainObject(parsed.stroke)) return {kind: "invalid"};
  return {kind: "ok", style: {...defaults, ...parsed} as T};
};
