import {toHiragana} from "wanakana";
import {splitOkuriganaCompact} from "../../renderer/utils/japaneseOkurigana";
import {formatPinyinReading} from "../handler/pinyinTones";
import {getStore} from "../handler/common/storeHandlers";

export const USER_DICTIONARY_KEY = "userDictionary.data";
export const USER_DICTIONARY_ENABLED_KEY = "userDictionary.enabled";
export const USER_DICTIONARY_LANGUAGES = ["ja", "zh-CN", "yue", "vi"] as const;
export type UserDictionaryLanguage = typeof USER_DICTIONARY_LANGUAGES[number];
export type UserDictionaryEntry = {
  surface: string;
  reading: string;
  meaning: string;
  language: UserDictionaryLanguage;
  source: "ai" | "manual";
  updatedAt: number;
};
export type UserDictionaryChange = {revision: number; language: string; surfaces: string[]};
type DictionaryState = {revision: number; entries: UserDictionaryEntry[]};
type DictionarySuppression = Pick<UserDictionaryEntry, "language" | "surface">;
type StoredDictionaryState = DictionaryState & {suppressions: DictionarySuppression[]};
type DictionaryStore = {get: (key: string, fallback?: unknown) => unknown; set: (key: string, value: unknown) => void};
const MAX_ENTRIES = 2000;
const MAX_SUPPRESSIONS = 2000;
const languageSet = new Set<string>(USER_DICTIONARY_LANGUAGES);
const identity = (entry: Pick<UserDictionaryEntry, "language" | "surface">) => `${entry.language}\0${entry.surface}`;
const boundedText = (value: unknown, max: number, field: string, optional = false) => {
  if (typeof value !== "string") throw new Error(`A dictionary ${field} is required.`);
  const text = value.normalize("NFC").trim();
  if ((!optional && !text) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`Invalid dictionary ${field}.`);
  return text;
};

export function validateUserDictionaryEntry(input: unknown, now = Date.now()): UserDictionaryEntry {
  const entry = input as Partial<UserDictionaryEntry>;
  if (!entry || !languageSet.has(entry.language)) throw new Error("Unsupported user dictionary language.");
  if (entry.source !== "ai" && entry.source !== "manual") throw new Error("Dictionary source must be ai or manual.");
  return {
    surface: boundedText(entry.surface, 128, "surface"),
    reading: boundedText(entry.reading ?? "", 256, "reading", entry.language === "vi"),
    meaning: boundedText(entry.meaning, 1000, "meaning"),
    language: entry.language, source: entry.source, updatedAt: now
  };
}

export function createUserDictionary(options: {getStore: () => Promise<DictionaryStore>; now?: () => number; onChange?: (change: UserDictionaryChange) => void}) {
  let rawState: unknown;
  let state: StoredDictionaryState = {revision: 0, entries: [], suppressions: []};
  let writing = Promise.resolve();
  const groups = new Map<string, UserDictionaryEntry[]>();
  const read = (store: DictionaryStore) => {
    const raw = store.get(USER_DICTIONARY_KEY, undefined);
    if (raw === rawState) return state;
    const input = raw as Partial<StoredDictionaryState>;
    const suppressions = new Map<string, DictionarySuppression>();
    if (input?.suppressions !== undefined && (!Array.isArray(input.suppressions) || input.suppressions.length > MAX_SUPPRESSIONS)) {
      throw new Error(`The user dictionary can remember up to ${MAX_SUPPRESSIONS} removed terms.`);
    }
    for (const item of input?.suppressions ?? []) {
      if (!item || !languageSet.has(item.language)) throw new Error("Invalid removed dictionary term language.");
      const suppression = {language: item.language, surface: boundedText(item.surface, 128, "surface")};
      suppressions.set(identity(suppression), suppression);
    }
    const entries = new Map<string, UserDictionaryEntry>();
    for (const item of Array.isArray(input?.entries) ? input.entries.slice(0, MAX_ENTRIES) : []) {
      try {
        const parsed = validateUserDictionaryEntry(item, Number.isFinite(item.updatedAt) ? item.updatedAt : 0);
        entries.set(identity(parsed), parsed);
      } catch { /* An invalid imported entry cannot affect tokenization. */ }
    }
    state = {revision: Number.isSafeInteger(input?.revision) && input.revision >= 0 ? input.revision : 0,
      entries: [...entries.values()], suppressions: [...suppressions.values()]};
    rawState = raw;
    groups.clear();
    return state;
  };
  const list = async (language?: string): Promise<DictionaryState> => {
    if (language !== undefined && !languageSet.has(language)) throw new Error("Unsupported user dictionary language.");
    const data = read(await options.getStore());
    return {revision: data.revision, entries: data.entries.filter((entry) => !language || entry.language === language)};
  };
  const enabledEntries = async (language: string): Promise<UserDictionaryEntry[]> => {
    if (!languageSet.has(language)) return [];
    const store = await options.getStore();
    if (store.get(USER_DICTIONARY_ENABLED_KEY, false) !== true) return [];
    const data = read(store);
    if (!groups.has(language)) groups.set(language, data.entries.filter((entry) => entry.language === language));
    return groups.get(language);
  };
  const commit = (store: DictionaryStore, entries: UserDictionaryEntry[], changed: UserDictionaryEntry[], suppressions: DictionarySuppression[]) => {
    const next = {revision: read(store).revision + 1, entries, suppressions};
    store.set(USER_DICTIONARY_KEY, next);
    rawState = next;
    state = next;
    groups.clear();
    for (const language of new Set(changed.map((entry) => entry.language))) {
      options.onChange?.({revision: next.revision, language, surfaces: [...new Set(changed.filter((entry) => entry.language === language).map((entry) => entry.surface))]});
    }
    return {revision: next.revision, entries: [...entries]};
  };
  const upsert = (inputs: unknown[]): Promise<DictionaryState> => {
    const work = writing.catch(() => undefined).then(async () => {
      if (!Array.isArray(inputs) || inputs.length > 100) throw new Error("Update at most 100 dictionary entries at a time.");
      const parsed = inputs.map((input) => validateUserDictionaryEntry(input, (options.now ?? Date.now)()));
      const store = await options.getStore();
      const current = read(store);
      const entries = new Map(current.entries.map((entry) => [identity(entry), entry]));
      const suppressions = new Map(current.suppressions.map((entry) => [identity(entry), entry]));
      const changed: UserDictionaryEntry[] = [];
      const enabled = store.get(USER_DICTIONARY_ENABLED_KEY, false) === true;
      for (const entry of parsed) {
        const prior = entries.get(identity(entry));
        if (entry.source === "ai" && (!enabled || prior?.source === "manual" || suppressions.has(identity(entry)))) continue;
        // An explicit manual save restores a removed surface; recurring AI suggestions cannot.
        const restored = entry.source === "manual" && suppressions.delete(identity(entry));
        if (!restored && prior?.meaning === entry.meaning && prior?.reading === entry.reading && prior?.source === entry.source) continue;
        entries.set(identity(entry), entry);
        changed.push(entry);
      }
      if (entries.size > MAX_ENTRIES) throw new Error(`The user dictionary can hold up to ${MAX_ENTRIES} entries.`);
      return changed.length ? commit(store, [...entries.values()], changed, [...suppressions.values()]) : {revision: current.revision, entries: [...current.entries]};
    });
    writing = work.then(() => undefined, () => undefined);
    return work;
  };
  const remove = (language: string, surface: string): Promise<DictionaryState> => {
    const work = writing.catch(() => undefined).then(async () => {
      if (!languageSet.has(language)) throw new Error("Unsupported user dictionary language.");
      const target = boundedText(surface, 128, "surface");
      const store = await options.getStore();
      const current = read(store);
      const changed = current.entries.filter((entry) => entry.language === language && entry.surface === target);
      const suppressions = new Map(current.suppressions.map((entry) => [identity(entry), entry]));
      for (const entry of changed) suppressions.set(identity(entry), {language: entry.language, surface: entry.surface});
      if (suppressions.size > MAX_SUPPRESSIONS) throw new Error(`The user dictionary can remember up to ${MAX_SUPPRESSIONS} removed terms. Save a removed term manually before removing another.`);
      return changed.length ? commit(store, current.entries.filter((entry) => !changed.includes(entry)), changed, [...suppressions.values()])
        : {revision: current.revision, entries: [...current.entries]};
    });
    writing = work.then(() => undefined, () => undefined);
    return work;
  };
  return {list, enabledEntries, upsert, remove};
}

const subscribers = new Set<(change: UserDictionaryChange) => void>();
export const userDictionary = createUserDictionary({getStore, onChange: (change) => subscribers.forEach((notify) => notify(change))});
export const onUserDictionaryChanged = (notify: (change: UserDictionaryChange) => void) => {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
};
export const enabledUserDictionaryEntries = (language: string) => userDictionary.enabledEntries(language).catch(() => []);
export const lookupUserDictionaryEntry = async (language: string, surface: string) =>
  (await enabledUserDictionaryEntries(language)).find((entry) => entry.surface === surface.normalize("NFC"));

/** The ordinary dictionary panels keep their existing result formats. */
export const userJapaneseDictionaryResult = (entry: UserDictionaryEntry) => ({
  id: `user:${identity(entry)}`,
  userDictionary: {language: entry.language, surface: entry.surface, source: entry.source},
  kanji: [{common: false, text: entry.surface, tags: []}],
  kana: [{common: false, text: toHiragana(entry.reading), tags: [], appliesToKanji: ["*"]}],
  sense: [{partOfSpeech: [], appliesToKanji: ["*"], appliesToKana: ["*"], related: [], antonym: [], field: [], dialect: [], misc: [],
    info: [entry.source === "ai" ? "AI user dictionary" : "User dictionary"], languageSource: [], gloss: [{lang: "eng", text: entry.meaning, type: null}]}]
});
export const userChineseDictionaryResult = (entry: UserDictionaryEntry) => ({
  id: `user:${identity(entry)}`, content: entry.surface, simplified: entry.surface,
  pinyin: entry.reading, jyutping: entry.reading, meaning: [entry.meaning],
  userDictionary: {language: entry.language, surface: entry.surface, source: entry.source}
});

export const userVietnameseDictionaryResult = (entry: UserDictionaryEntry) => ({
  id: `user:${identity(entry)}`, content: entry.surface, meaning: entry.meaning,
  userDictionary: {language: entry.language, surface: entry.surface, source: entry.source}
});

type Trie = {next: Map<string, Trie>; entry?: UserDictionaryEntry};
const tries = new WeakMap<UserDictionaryEntry[], Trie>();
const trieFor = (entries: UserDictionaryEntry[]) => {
  let root = tries.get(entries);
  if (root) return root;
  root = {next: new Map()};
  for (const entry of entries) {
    let node = root;
    for (const letter of entry.surface) {
      if (!node.next.has(letter)) node.next.set(letter, {next: new Map()});
      node = node.next.get(letter);
    }
    node.entry = entry;
  }
  tries.set(entries, root);
  return root;
};

export const userDictionaryToken = (entry: UserDictionaryEntry, toneType = "num") => {
  const common = {origin: entry.surface, meaning: entry.meaning, userDictionaryMeaning: entry.meaning,
    userDictionaryId: `${entry.language}:${entry.surface}`, userDictionarySource: entry.source};
  if (entry.language === "ja") {
    const hiragana = toHiragana(entry.reading, {convertLongVowelMark: false});
    return {...common, basicForm: entry.surface, hiragana, pos: "名詞-ユーザー辞書", separation: splitOkuriganaCompact(entry.surface, hiragana)};
  }
  if (entry.language === "vi") return {...common, separation: entry.surface.split(/\s+/).map((main) => ({main}))};
  const field = entry.language === "yue" ? "jyutping" : "pinyin";
  const tones: Record<string, string> = {1: "ˉ¹", 2: "⸍²", 3: "-₃", 4: "⸜₄", 5: "⸝₅", 6: "ˍ₆"};
  const readings = entry.reading.split(/\s+/).map((reading) => entry.language === "zh-CN" ? formatPinyinReading(reading, toneType)
    : toneType === "num" ? reading.replace(/([1-6])$/, (match) => tones[match]) : reading);
  const characters = Array.from(entry.surface);
  const separation = characters.length === readings.length ? characters.map((main, index) => ({main, [field]: readings[index]}))
    : [{main: entry.surface, [field]: readings.join(" ")}];
  return {...common, [field]: readings.join(" "), separation};
};

/** Custom phrases take the longest match; unmatched spans retain the application's normal analysis. */
export async function analyzeWithUserDictionary(
  sentence: string,
  language: string,
  entries: UserDictionaryEntry[],
  analyzeDefault: (text: string) => Promise<any[]> | any[],
  toneType = "num",
  shouldApply: (entry: UserDictionaryEntry) => boolean | Promise<boolean> = () => true
): Promise<any[]> {
  if (!entries.length) return analyzeDefault(sentence);
  const trie = trieFor(entries);
  const chars = Array.from(sentence);
  const result: any[] = [];
  let gap = "";
  for (let index = 0; index < chars.length;) {
    let node = trie;
    let match: {entry: UserDictionaryEntry; end: number} | undefined;
    const matches: {entry: UserDictionaryEntry; end: number}[] = [];
    for (let cursor = index; cursor < chars.length; cursor++) {
      node = node.next.get(chars[cursor]);
      if (!node) break;
      const wordEdge = language !== "vi" || ((!chars[index - 1] || !/[\p{L}\p{N}]/u.test(chars[index - 1]))
        && (!chars[cursor + 1] || !/[\p{L}\p{N}]/u.test(chars[cursor + 1])));
      if (node.entry && wordEdge) matches.push({entry: node.entry, end: cursor + 1});
    }
    while (matches.length) {
      const candidate = matches.pop();
      if (await shouldApply(candidate.entry)) { match = candidate; break; }
    }
    if (!match) { gap += chars[index++]; continue; }
    if (gap) { result.push(...await analyzeDefault(gap)); gap = ""; }
    result.push(userDictionaryToken(match.entry, toneType));
    index = match.end;
  }
  if (gap) result.push(...await analyzeDefault(gap));
  return result;
}
