import {toHiragana} from 'wanakana';
import Japanese from '../handler/japanese';
import {exactJapaneseMatches, findJapaneseEntry, rankJapaneseMatches} from '../handler/languages/learningGlosses';
import {parseJapaneseVerbs} from '../handler/languages/analyzer';
import {isConjugationOf} from '../handler/languages/verbConjugation';
import {splitOkuriganaCompact} from '../../renderer/utils/japaneseOkurigana';
import {lookupUserDictionaryEntry} from './userDictionary';
import {throwIfAborted} from './runCommand';
import type {BoxTipsContent, GenerateBoxTipsOptions} from './boxTips';
import {isEnglishLearningText} from '../../renderer/utils/learningTextLanguage';

export interface ForecastJapaneseWord {
  basicForm: string;
  reading: string;
  source: 'default' | 'user';
  userSource?: 'ai' | 'manual';
  meaning?: string;
}

export interface ForecastDictionaryDependencies {
  /** null means a confirmed miss; reject when the dictionary is unavailable. */
  lookup: (surface: string, reading?: string) => Promise<ForecastJapaneseWord | null>;
  derive: (surface: string) => Promise<{basicForm: string; reading: string; pos?: string} | null>;
}

const defaultDependencies: ForecastDictionaryDependencies = {
  lookup: async (surface, reading = '') => {
    const custom = await lookupUserDictionaryEntry('ja', surface);
    const userWord = custom ? {basicForm: surface, reading: custom.reading, source: 'user' as const, userSource: custom.source, meaning: custom.meaning} : null;
    if (custom?.source === 'manual') return userWord;
    if (!Japanese.Dict.db) {
      if (userWord) return userWord;
      throw new Error('The Japanese dictionary is not ready.');
    }
    const exact = rankJapaneseMatches(await exactJapaneseMatches(Japanese.Dict.db, surface), surface);
    const entry = findJapaneseEntry(exact, surface, reading) ?? exact[0];
    if (!entry) return userWord;
    const kana = entry.kana.find((item) => toHiragana(item.text) === toHiragana(reading)) ?? entry.kana[0];
    return {basicForm: surface, reading: kana?.text ?? reading, source: 'default'};
  },
  derive: async (surface) => {
    const words = await parseJapaneseVerbs(Japanese.processKuromojinToSeparations(await Japanese.tokenizeUsingKuromoji(surface)));
    const word = words.length === 1 && words[0].origin === surface ? words[0] : null;
    return word?.basicForm && word.basicForm !== '*' ? {basicForm: word.basicForm, reading: word.hiragana, pos: word.pos} : null;
  }
};

/** AI selects boundaries and contextual glosses; the actual dictionary remains the authority for entries. */
export async function resolveForecastDictionaryContent(
  content: BoxTipsContent,
  options: Pick<GenerateBoxTipsOptions, 'lang' | 'includeDictionary' | 'signal'>,
  dependencies: ForecastDictionaryDependencies = defaultDependencies
): Promise<BoxTipsContent> {
  if (!options.includeDictionary || options.lang !== 'ja') return content;
  const dictionaryEntries = new Map<string, NonNullable<BoxTipsContent['dictionaryEntries']>[number]>();
  const retokenizations: NonNullable<BoxTipsContent['retokenizations']> = [];
  const known = new Map<string, Promise<ForecastJapaneseWord | null>>();
  const lookup = (surface: string, reading = '') => {
    const key = `${surface}\0${reading}`;
    if (!known.has(key)) known.set(key, dependencies.lookup(surface, reading));
    return known.get(key)!;
  };
  const resolveWord = async (surface: string, reading: string, suggestedBase?: string) => {
    let result = await lookup(surface, reading);
    if (result) return {result, surfaceReading: result.reading, pos: undefined};
    let derived: Awaited<ReturnType<ForecastDictionaryDependencies['derive']>> = null;
    try { derived = await dependencies.derive(surface); } catch { /* The exact dictionary check remains valid. */ }
    const base = derived?.basicForm && derived.basicForm !== surface ? derived.basicForm
      : suggestedBase && suggestedBase !== surface && isConjugationOf(surface, suggestedBase) ? suggestedBase : null;
    if (base) result = await lookup(base);
    return {result, surfaceReading: derived?.reading || reading, pos: derived?.pos};
  };

  for (const cue of content.retokenizations ?? []) {
    throwIfAborted(options.signal);
    const pendingEntries = new Map<string, NonNullable<BoxTipsContent['dictionaryEntries']>[number]>();
    const tokens: typeof cue.tokens = [];
    try {
      for (const candidate of cue.tokens) {
        throwIfAborted(options.signal);
        const surface = candidate.origin;
        const reading = candidate.hiragana || '';
        const lexical = /\p{L}/u.test(surface);
        const resolved = lexical ? await resolveWord(surface, reading, candidate.basicForm) : null;
        const found = resolved?.result;
        const surfaceReading = toHiragana(resolved?.surfaceReading || reading, {convertLongVowelMark: false});
        const token = {
          origin: surface, basicForm: found?.basicForm || surface,
          hiragana: surfaceReading, pos: resolved?.pos || (lexical ? '名詞-AI分割' : '記号'),
          separation: splitOkuriganaCompact(surface, surfaceReading),
          contextMeaning: candidate.contextMeaning || '',
          aiRetokenized: true,
          ...(found?.source === 'user' ? {userDictionaryId: `ja:${found.basicForm}`,
            userDictionarySource: found.userSource, userDictionaryMeaning: found.meaning} : {})
        };
        if (lexical && !found) {
          // Every published unknown word must have a real fallback entry for MeaningBox.
          // A scene-specific gloss cannot safely substitute for a reusable dictionary definition.
          if (!surfaceReading || !isEnglishLearningText(candidate.dictionaryMeaning)) {
            throw new Error('A missing word needs a reliable reading and reusable English definition.');
          }
          pendingEntries.set(surface, {surface, reading: surfaceReading, meaning: candidate.dictionaryMeaning, language: 'ja'});
        }
        tokens.push(token);
      }
      for (const [surface, entry] of pendingEntries) dictionaryEntries.set(surface, entry);
      retokenizations.push({...cue, tokens});
    } catch (error) {
      throwIfAborted(options.signal);
      // An unavailable dictionary is not a miss. Keep the normal subtitle analysis instead.
      console.warn('[forecast] Skipping unresolved Japanese cue:', error instanceof Error ? error.message : error);
    }
  }

  // Older model responses can still provide a standalone candidate. Check those too, never upsert blindly.
  for (const entry of content.dictionaryEntries ?? []) {
    throwIfAborted(options.signal);
    try {
      if (!(await resolveWord(entry.surface, entry.reading)).result) dictionaryEntries.set(entry.surface, entry);
    } catch { throwIfAborted(options.signal); }
  }
  throwIfAborted(options.signal);
  return {tips: content.tips, dictionaryEntries: [...dictionaryEntries.values()].slice(0, 80),
    ...(content.retokenizations ? {retokenizations} : {})};
}
