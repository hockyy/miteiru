import {comparableJyutping, comparablePinyin, pinyinToNumbers} from "./readings";

/**
 * CC-CEDICT (Mandarin) and CantoDict (Cantonese) entries as the language tools give them. The app's
 * Chinese dictionaries keep each source's own shape (docs/DATA_FORMAT.md):
 *
 *   CC-CEDICT        {content, simplified, pinyin: ["mei2 xiang3 dao4"], meaning: ["didn't expect"]}
 *   CantoDict words  {content, jyutping: "keoi5 dei6", meaning: [["they", " them", " ..."], ...]}
 *                    (each inner list is one sense, cut at its commas)
 *   CantoDict        {content, pinyin: ["qu3", "di4"], jyutping: ["keoi5", "dei6"],
 *                    meaning: ["them; they | Third-party plural pronoun | Std. Chin.: 他們 ..."]}
 *
 * The subtitle hint used to keep only a meaning of at most 10 characters, so 没想到 ("didn't expect"),
 * 玉皇大帝, 龙王, 飲茶 and 咗 got none; the senses here are whole.
 */
export interface ChineseEntryView {
  id: string;
  traditional: string;
  simplified: string;
  /** Every headword form: CC-CEDICT gives one of each script, CantoDict may list variants ("A，B"). */
  traditionalForms: string[];
  simplifiedForms: string[];
  /** Numbered pinyin, one string per reading the entry lists ("mei2 xiang3 dao4"). */
  pinyin: string[];
  /** Numbered jyutping, one string per reading ("keoi5 dei6"). */
  jyutping: string[];
  /** Each sense as one line, in the dictionary's order. */
  senses: string[];
  /** Measure words from CC-CEDICT's CL: notes, as written (simplified where it gives both). */
  measureWords: string[];
  /** "variant of 某", "see 某": senses that only point to another word. */
  references: string[];
  /** Structured targets only when every definition is a pointer. Keep the source’s display strings. */
  referenceTargets?: ReferenceTarget[];
  /** CantoDict's Std. Chin. note: the Standard Chinese word for it. */
  standardChinese?: string;
  notes: string[];
  /** Only a surname, or a name (capitalized pinyin). */
  surname: boolean;
  properNoun: boolean;
}

const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : []);

const cleanText = (text: string) => text.replace(/\s+/g, " ").trim();

/** CantoDict words' senses were cut at commas, and some at brackets ("(see ", "去飲", ")"): put them back. */
const nestedSenses = (meaning: unknown[]): string[] => {
  const senses: string[] = [];
  for (const item of meaning) {
    const text = cleanText(asStrings(item).map((piece) => piece.trim()).filter(Boolean).join(", "));
    if (!text) continue;
    const previous = senses.at(-1);
    const open = previous ? (previous.match(/\(/g)?.length ?? 0) - (previous.match(/\)/g)?.length ?? 0) : 0;
    if (previous !== undefined && (open > 0 || /^[)\]]/.test(text))) senses[senses.length - 1] = cleanText(`${previous}${/\($/.test(previous) ? "" : " "}${text}`).replace(/\s+\)/g, ")").replace(/\(\s+/g, "(");
    else senses.push(text);
  }
  return senses;
};

const MEASURE_WORD = /^CL:(.+)$/;
const REFERENCE = /^(?:(?:old |also written |erhua )?variant of|see (?:also )?|same as |abbr\. for )/i;

const RELATIONS = {
  "erhua variant of": "erhua", "variant of": "variant", "old variant of": "variant",
  "also written": "variant", "also written as": "variant", "also written variant of": "variant",
  "same as": "same_as", "see": "see", "see also": "see", "abbr. for": "abbreviation"
} as const;
type Relation = typeof RELATIONS[keyof typeof RELATIONS];
interface ReferenceTarget {
  traditional: string;
  simplified: string;
  relation: Relation;
  pinyin?: string;
  jyutping?: string;
}

// "see also" before "see", "also written as" before "also written".
const relationPrefixes = (Object.keys(RELATIONS) as Array<keyof typeof RELATIONS>).sort((a, b) => b.length - a.length);
const relationAtStart = (text: string) => {
  const lower = text.toLowerCase();
  return relationPrefixes.find((prefix) => lower === prefix || lower.startsWith(prefix + " "));
};

/** Read the original script pair and bracketed pinyin before the display formatter shortens them. */
const referenceTarget = (line: string, nested: boolean): ReferenceTarget | undefined => {
  const prefix = relationAtStart(line);
  if (!prefix) return;
  const body = line.slice(prefix.length).trim();
  const target = body.match(/^["“]?([\p{L}\p{N}·〇○-]+)(?:\|([\p{L}\p{N}·〇○-]+))?["”]?(?:\s*\[([^\]]+)\])?/u);
  if (!target) return;
  const tail = body.slice(target[0].length).trim();
  if (tail && !target[3] && !/\p{Script=Han}|[A-Z]/u.test(target[1])) return;
  let jyutping: string | undefined;
  if (tail && nested) {
    // CantoDict's word list puts an optional Jyutping reading in its own row, sometimes unspaced.
    const pronunciation = tail.match(/^\(?([a-z]+[1-6](?:\s*[a-z]+[1-6])*)\)?$/i);
    if (!pronunciation) return;
    jyutping = pronunciation[1].replace(/([1-6])(?=[a-z])/gi, "$1 ");
  } else if (tail && !target[3] && !/^[,，(（.。]/u.test(tail)) return;
  return {traditional: target[1], simplified: target[2] ?? target[1], relation: RELATIONS[prefix],
    ...(target[3] ? {pinyin: pinyinToNumbers(target[3])} : {}), ...(jyutping ? {jyutping} : {})};
};

const targetsOf = (lines: string[], nested: boolean): ReferenceTarget[] | undefined => {
  if (!lines.length) return;
  const definitions: string[] = [];
  for (const line of lines) {
    if (relationAtStart(line)) definitions.push(line);
    else if (nested && definitions.length) definitions[definitions.length - 1] += " " + line;
    else return;
  }
  const targets = definitions.map((line) => referenceTarget(line, nested));
  // A nested continuation can be a definition in its own right. Only consume it if it parsed.
  if (nested && targets.includes(undefined)) return;
  return targets.filter((target): target is ReferenceTarget => target !== undefined);
};

/** A CC-CEDICT word like 個|个[ge4]: the simplified form when it gives both. */
const measureWordsOf = (text: string): string[] => text.split(",").map((part) => {
  const word = part.trim().replace(/\[[^\]]*\]$/, "");
  return word.includes("|") ? word.split("|")[1] : word;
}).filter(Boolean);

/** Strips CC-CEDICT's pinyin after a word (葡萄[pu2 tao2] is 葡萄). */
const withoutBracketReadings = (text: string) => text.replace(/([\p{Script=Han}|]+)\[[a-zü:\d ]+\]/giu, (_, word: string) => word.includes("|") ? word.split("|")[1] : word);

export const normalizeChineseEntry = (raw: any): ChineseEntryView | null => {
  if (!raw || typeof raw !== "object" || typeof raw.content !== "string") return null;
  const traditionalForms = raw.content.split(/，|, /).map((form: string) => form.trim()).filter(Boolean);
  const simplifiedForms = typeof raw.simplified === "string" && raw.simplified
    ? raw.simplified.split(/，|, /).map((form: string) => form.trim()).filter(Boolean) : traditionalForms;
  const traditional = traditionalForms[0] ?? raw.content;
  const simplified = simplifiedForms[0] ?? traditional;
  const meaning: unknown[] = Array.isArray(raw.meaning) ? raw.meaning : [];
  const nested = meaning.some(Array.isArray);
  let senses: string[] = [];
  const measureWords: string[] = [];
  const references: string[] = [];
  const definitions: string[] = [];
  let standardChinese: string | undefined;
  if (nested) {
    senses = nestedSenses(meaning);
  } else {
    for (const text of asStrings(meaning)) {
      // CantoDict joins an entry's gloss, explanation and Standard Chinese with " | ".
      for (const piece of text.split(/\s+\|\s+/).map(cleanText).filter(Boolean)) {
        const measure = piece.match(MEASURE_WORD);
        if (measure) {
          measureWords.push(...measureWordsOf(measure[1]));
          continue;
        }
        const standard = piece.match(/^Std\. Chin\.:\s*(.+)$/i);
        if (standard) {
          standardChinese = standard[1];
          continue;
        }
        definitions.push(piece);
        if (REFERENCE.test(piece)) references.push(withoutBracketReadings(piece));
        else senses.push(withoutBracketReadings(piece));
      }
    }
  }
  // CantoDict lists one syllable per item (as many as the word has characters); CC-CEDICT one reading per item.
  const length = Array.from(traditional).length;
  const readings = (value: unknown) => {
    const list = asStrings(value).filter(Boolean);
    return list.length > 1 && list.length === length && list.every((syllable) => !/\s/.test(syllable)) ? [list.join(" ")] : list;
  };
  const pinyin = readings(raw.pinyin);
  const jyutping = readings(raw.jyutping);
  const allSenses = [...senses, ...references];
  const referenceTargets = targetsOf(nested ? senses : definitions, nested);
  return {
    id: String(raw.id ?? ""),
    traditional,
    simplified,
    traditionalForms,
    simplifiedForms,
    pinyin,
    jyutping,
    senses,
    measureWords,
    references,
    ...(referenceTargets ? {referenceTargets} : {}),
    ...(standardChinese ? {standardChinese} : {}),
    notes: asStrings(raw.notes).map(cleanText).filter(Boolean),
    surname: allSenses.length > 0 && allSenses.every((sense) => /^surname\b/i.test(sense)),
    properNoun: pinyin.length > 0 && pinyin.every((reading) => /^[A-Z]/.test(reading))
  };
};

export interface ChineseMatch {
  /** The word as it appears in the text. */
  word: string;
  /** zh-Hans words match simplified forms, zh-Hant and yue traditional ones; unknown matches either. */
  script?: "simplified" | "traditional";
  /** The tokenizer's reading: numbered pinyin (zh) or jyutping (yue), syllables separated by spaces. */
  reading?: string;
  cantonese?: boolean;
}

const headwordFits = (entry: ChineseEntryView, {word, script}: ChineseMatch) => (
  script === "simplified" ? entry.simplifiedForms.includes(word)
    : script === "traditional" ? entry.traditionalForms.includes(word) : anyHeadword(entry, word)
);

const anyHeadword = (entry: ChineseEntryView, word: string) => entry.simplifiedForms.includes(word) || entry.traditionalForms.includes(word);

/** Whether the entry lists the reading. */
export const entryHasReading = (entry: ChineseEntryView, reading: string, cantonese: boolean): boolean => {
  if (!reading) return false;
  if (cantonese) return entry.jyutping.some((candidate) => comparableJyutping(candidate) === comparableJyutping(reading));
  return entry.pinyin.some((candidate) => comparablePinyin(candidate) === comparablePinyin(reading));
};

/**
 * Entries that are the word, the likeliest meaning first: a headword in the text's script (else in
 * either script), read as the tokenizer read it, then not only a surname, a name or a pointer to
 * another word, then CantoDict's word list before its character-style entries, then the most senses.
 */
export const rankChineseEntries = (entries: ChineseEntryView[], match: ChineseMatch): ChineseEntryView[] => {
  const unique = [...new Map(entries.map((entry) => [entry.id, entry])).values()].filter((entry) => anyHeadword(entry, match.word));
  const score = (entry: ChineseEntryView): number[] => [
    headwordFits(entry, match) ? 1 : 0,
    match.reading && entryHasReading(entry, match.reading, Boolean(match.cantonese)) ? 1 : 0,
    entry.surname ? 0 : 1,
    entry.senses.length > 0 ? 1 : 0,
    entry.properNoun ? 0 : 1,
    // CantoDict's word list keeps jyutping as one string; its fuller entries list one syllable per item.
    match.cantonese && entry.jyutping.length === 1 && !entry.pinyin.length ? 1 : 0,
    entry.senses.length
  ];
  return unique
    .map((entry) => ({entry, score: score(entry)}))
    .sort((a, b) => {
      const key = a.score.findIndex((value, index) => value !== b.score[index]);
      return key < 0 ? 0 : b.score[key] - a.score[key];
    })
    .map(({entry}) => entry);
};

export interface ResolvedChineseReference {
  word: string;
  entry_id: string;
  senses: string[];
  relation: Relation;
}

/** Follow one exact, same-script reference to an entry with definitions of its own. */
export const resolveChineseReference = async (
  entry: ChineseEntryView, match: ChineseMatch, lookup: (word: string) => Promise<ChineseEntryView[]>
): Promise<ResolvedChineseReference | undefined> => {
  if (!entry.referenceTargets) return;
  const script = match.script ?? (entry.simplifiedForms.includes(match.word) ? "simplified" : "traditional");
  for (const target of entry.referenceTargets) {
    const word = target[script];
    if (headwordFits(entry, {word, script})) continue;
    const candidates = (await lookup(word)).filter((candidate) => candidate.id && candidate.id !== entry.id && candidate.senses.length
      && !candidate.referenceTargets && headwordFits(candidate, {word, script})
      && (!target.pinyin || entryHasReading(candidate, target.pinyin, false))
      && (!target.jyutping || entryHasReading(candidate, target.jyutping, true)));
    const [found] = rankChineseEntries(candidates, {word, script, cantonese: match.cantonese});
    if (found) return {word, entry_id: found.id, senses: found.senses, relation: target.relation};
  }
};

/** A sense short enough for a hint under a subtitle word: its first comma or semicolon part, notes dropped. */
export const shortSense = (sense: string): string => sense
  .replace(/\([^()]*\)/g, "")
  .replace(/\[[^\][]*]/g, "")
  .split(/[;,]/)
  .map((part) => part.trim())
  .find(Boolean) ?? "";
