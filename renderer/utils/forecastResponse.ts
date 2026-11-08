import type {BoxTipsResult} from '../../main/helpers/boxTips';

const invalid = (field: string): never => { throw new Error(`Invalid AI learning response: ${field}. Retry this batch.`); };
const object = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(`${field} must be an object`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, field: string, maximum: number): string => {
  if (typeof value !== 'string' || value.length > maximum) return invalid(`${field} must be text`);
  return value;
};
const list = (value: unknown, field: string, maximum: number): unknown[] => {
  if (!Array.isArray(value) || value.length > maximum) return invalid(`${field} must be an array`);
  for (let index = 0; index < value.length; index++) if (!(index in value)) return invalid(`${field} has a missing item`);
  return value;
};
const range = (value: Record<string, unknown>) => {
  const {from, to} = value;
  if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)
    || from < 0 || to <= from || to - from > 90_000) return invalid('cue times are invalid');
  return {from, to};
};

const tokenTextFields = ['basicForm', 'hiragana', 'romaji', 'contextMeaning', 'dictionaryMeaning', 'pos',
  'userDictionaryId', 'userDictionarySource', 'userDictionaryMeaning'] as const;

const readToken = (value: unknown) => {
  const input = object(value, 'word');
  const origin = text(input.origin, 'word surface', 128);
  if (!origin) return invalid('word surface is empty');
  const token: Record<string, unknown> = {origin};
  for (const field of tokenTextFields) if (input[field] !== undefined) token[field] = text(input[field], `word ${field}`, 1024);
  if (input.aiRetokenized !== undefined) {
    if (typeof input.aiRetokenized !== 'boolean') return invalid('word AI flag must be boolean');
    token.aiRetokenized = input.aiRetokenized;
  }
  if (input.separation !== undefined) token.separation = list(input.separation, 'word readings', 128).map((value) => {
    const part = object(value, 'word reading');
    const clean: Record<string, unknown> = {main: text(part.main, 'reading surface', 128)};
    for (const field of ['hiragana', 'romaji', 'pinyin', 'jyutping', 'meaning']) {
      if (part[field] !== undefined) clean[field] = text(part[field], `reading ${field}`, 1024);
    }
    for (const field of ['isKana', 'isKanji', 'isMixed']) if (part[field] !== undefined) {
      if (typeof part[field] !== 'boolean') return invalid(`reading ${field} must be boolean`);
      clean[field] = part[field];
    }
    return clean;
  });
  return token;
};

/** Check IPC data before React state updaters run: their errors escape an async request's catch. */
export function validateForecastResult(value: unknown): BoxTipsResult {
  const input = object(value, 'batch');
  if (typeof input.ok !== 'boolean') return invalid('batch status must be boolean');
  if (input.cancelled !== undefined && typeof input.cancelled !== 'boolean') return invalid('cancellation flag must be boolean');
  if (!input.ok) return {ok: false, tips: [], cancelled: input.cancelled === true,
    error: input.error === undefined ? 'Could not prepare this learning batch.' : text(input.error, 'error message', 4096)};
  const kinds = new Set(['grammar', 'pun', 'joke', 'idiom', 'proverb', 'usage']);
  const tips = list(input.tips, 'tips', 3).map((value) => {
    const tip = object(value, 'tip');
    if (typeof tip.kind !== 'string' || !kinds.has(tip.kind)) return invalid('tip kind is invalid');
    return {...range(tip), kind: tip.kind, title: text(tip.title, 'tip title', 512), text: text(tip.text, 'tip explanation', 2048)};
  });
  const dictionaryEntries = input.dictionaryEntries === undefined ? undefined
    : list(input.dictionaryEntries, 'dictionary entries', 80).map((value) => {
      const entry = object(value, 'dictionary entry');
      return {surface: text(entry.surface, 'dictionary surface', 128), reading: text(entry.reading, 'dictionary reading', 120),
        meaning: text(entry.meaning, 'dictionary meaning', 1024), language: text(entry.language, 'dictionary language', 32)};
    });
  let tokenCount = 0;
  const retokenizations = input.retokenizations === undefined ? undefined
    : list(input.retokenizations, 'word analyses', 80).map((value) => {
      const cue = object(value, 'word analysis');
      const tokens = list(cue.tokens, 'words', 96).map(readToken);
      tokenCount += tokens.length;
      if (!tokens.length || tokenCount > 800) return invalid('word analysis has too many or no words');
      return {...range(cue), text: text(cue.text, 'subtitle text', 16_000), tokens};
    });
  return {ok: true, tips, ...(dictionaryEntries ? {dictionaryEntries} : {}),
    ...(retokenizations ? {retokenizations} : {})} as BoxTipsResult;
}
