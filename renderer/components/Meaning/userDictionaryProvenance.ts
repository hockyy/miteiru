export type UserDictionaryProvenance = {
  language: string;
  surface: string;
  source: 'ai' | 'manual';
};

const languages = new Set(['ja', 'zh-CN', 'yue', 'vi']);

/** Only saved user entries are deletable. Legacy user ids retain their original identity. */
export function getUserDictionaryProvenance(entry: any, fallbackLanguage?: string): UserDictionaryProvenance | null {
  const source = entry?.userDictionary;
  const sourceLanguage = source?.language ?? fallbackLanguage;
  if (source && languages.has(sourceLanguage) && typeof source.surface === 'string' && source.surface.trim()
    && (source.source === 'ai' || source.source === 'manual')) {
    return {language: sourceLanguage, surface: source.surface, source: source.source};
  }
  if (typeof entry?.id !== 'string' || !entry.id.startsWith('user:')) return null;
  const [language, surface] = entry.id.slice(5).split('\0');
  if (!languages.has(language) || !surface) return null;
  const ai = entry.sense?.some((sense) => Array.isArray(sense.info) && sense.info.some((info) => typeof info === 'string' && /AI (?:user dictionary|generated)/i.test(info)));
  return {language, surface, source: ai ? 'ai' : 'manual'};
}
