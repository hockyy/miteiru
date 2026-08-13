/**
 * Dependency-free validator for the Miteiru Universal Dictionary schema
 * (see dictionary.schema.json). Mirrors the schema by hand so validation
 * works without ajv/zod in both the main process and tests.
 */
import type {LanguageFamily} from "./dictionaryTypes";

export interface ValidationError {
  /** JSON-pointer-ish location, e.g. "entries[3].headword". */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const PINYIN_PATTERN = /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+'?[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]*[1-5]?( [a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+'?[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]*[1-5]?)*$/i;
const JYUTPING_PATTERN = /^[a-z]+[1-6]?( [a-z]+[1-6]?)*$/;

const JAPANESE_CODES = new Set(["ja", "jpn"]);
const MANDARIN_CODES = new Set(["zh", "zh-CN", "zh-Hans", "zh-TW", "zh-Hant", "cmn"]);
const CANTONESE_CODES = new Set(["yue", "zh-HK", "zh-Hant-HK"]);

const ENTRY_KEYS = new Set(["id", "headword", "readings", "senses", "tags", "frequency", "japanese", "mandarin", "cantonese"]);
const SENSE_KEYS = new Set(["gloss", "partOfSpeech", "examples", "info", "related", "dialect", "field"]);
const EXTENSION_KEYS = ["japanese", "mandarin", "cantonese"] as const;

export const getLanguageFamily = (language: unknown): LanguageFamily => {
  if (typeof language !== "string") return null;
  if (JAPANESE_CODES.has(language)) return "japanese";
  if (MANDARIN_CODES.has(language)) return "mandarin";
  if (CANTONESE_CODES.has(language)) return "cantonese";
  return null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

class ErrorSink {
  errors: ValidationError[] = [];

  add(path: string, message: string) {
    this.errors.push({path, message});
  }

  checkKeys(value: Record<string, unknown>, allowed: Set<string>, path: string) {
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        this.add(path, `unexpected property "${key}"`);
      }
    }
  }

  checkNonEmptyString(value: unknown, path: string): boolean {
    if (typeof value !== "string" || value.length === 0) {
      this.add(path, "expected a non-empty string");
      return false;
    }
    return true;
  }

  checkStringArray(value: unknown, path: string, {minItems = 0, pattern, patternName}: {
    minItems?: number;
    pattern?: RegExp;
    patternName?: string;
  } = {}): boolean {
    if (!Array.isArray(value)) {
      this.add(path, "expected an array of strings");
      return false;
    }
    let ok = true;
    if (value.length < minItems) {
      this.add(path, `expected at least ${minItems} item(s)`);
      ok = false;
    }
    value.forEach((item, index) => {
      if (typeof item !== "string" || item.length === 0) {
        this.add(`${path}[${index}]`, "expected a non-empty string");
        ok = false;
      } else if (pattern && !pattern.test(item)) {
        this.add(`${path}[${index}]`, `"${item}" is not valid ${patternName ?? "format"}`);
        ok = false;
      }
    });
    return ok;
  }
}

const validateGloss = (sink: ErrorSink, value: unknown, path: string) => {
  if (typeof value === "string") {
    if (value.length === 0) sink.add(path, "expected a non-empty string");
    return;
  }
  if (!isPlainObject(value)) {
    sink.add(path, "gloss must be a string or an object with a text field");
    return;
  }
  sink.checkKeys(value, new Set(["text", "lang"]), path);
  sink.checkNonEmptyString(value.text, `${path}.text`);
  if (value.lang !== undefined) {
    if (typeof value.lang !== "string" || !LANGUAGE_CODE_PATTERN.test(value.lang)) {
      sink.add(`${path}.lang`, `"${value.lang}" is not a valid language code`);
    }
  }
};

const validateSense = (sink: ErrorSink, value: unknown, path: string, {requirePartOfSpeech = false} = {}) => {
  if (!isPlainObject(value)) {
    sink.add(path, "sense must be an object");
    return;
  }
  sink.checkKeys(value, SENSE_KEYS, path);
  if (value.gloss === undefined) {
    sink.add(`${path}.gloss`, "gloss is required");
  } else if (!Array.isArray(value.gloss) || value.gloss.length === 0) {
    sink.add(`${path}.gloss`, "gloss must be a non-empty array");
  } else {
    value.gloss.forEach((gloss, index) => validateGloss(sink, gloss, `${path}.gloss[${index}]`));
  }
  if (requirePartOfSpeech && value.partOfSpeech === undefined) {
    sink.add(`${path}.partOfSpeech`, "partOfSpeech is required for Japanese senses");
  }
  if (value.partOfSpeech !== undefined) {
    sink.checkStringArray(value.partOfSpeech, `${path}.partOfSpeech`);
  }
  if (value.examples !== undefined) {
    if (!Array.isArray(value.examples)) {
      sink.add(`${path}.examples`, "expected an array");
    } else {
      value.examples.forEach((example, index) => {
        const examplePath = `${path}.examples[${index}]`;
        if (!isPlainObject(example)) {
          sink.add(examplePath, "example must be an object");
          return;
        }
        sink.checkKeys(example, new Set(["text", "translation"]), examplePath);
        sink.checkNonEmptyString(example.text, `${examplePath}.text`);
        if (example.translation !== undefined) {
          sink.checkNonEmptyString(example.translation, `${examplePath}.translation`);
        }
      });
    }
  }
  for (const key of ["info", "related", "dialect", "field"] as const) {
    if (value[key] !== undefined) {
      sink.checkStringArray(value[key], `${path}.${key}`);
    }
  }
};

const validateJapaneseForm = (sink: ErrorSink, value: unknown, path: string, {allowAppliesTo = false} = {}) => {
  if (!isPlainObject(value)) {
    sink.add(path, "expected an object");
    return;
  }
  sink.checkKeys(value, new Set(allowAppliesTo ? ["text", "common", "tags", "appliesToKanji"] : ["text", "common", "tags"]), path);
  sink.checkNonEmptyString(value.text, `${path}.text`);
  if (value.common !== undefined && typeof value.common !== "boolean") {
    sink.add(`${path}.common`, "expected a boolean");
  }
  if (value.tags !== undefined) {
    sink.checkStringArray(value.tags, `${path}.tags`);
  }
  if (allowAppliesTo && value.appliesToKanji !== undefined) {
    sink.checkStringArray(value.appliesToKanji, `${path}.appliesToKanji`);
  }
};

const validateJapaneseExtension = (sink: ErrorSink, value: unknown, path: string) => {
  if (!isPlainObject(value)) {
    sink.add(path, "japanese extension must be an object");
    return;
  }
  sink.checkKeys(value, new Set(["kanji", "kana", "kanjiInfo"]), path);
  if (value.kanji !== undefined) {
    if (!Array.isArray(value.kanji)) {
      sink.add(`${path}.kanji`, "expected an array");
    } else {
      value.kanji.forEach((form, index) => validateJapaneseForm(sink, form, `${path}.kanji[${index}]`));
    }
  }
  if (value.kana !== undefined) {
    if (!Array.isArray(value.kana)) {
      sink.add(`${path}.kana`, "expected an array");
    } else {
      value.kana.forEach((form, index) => validateJapaneseForm(sink, form, `${path}.kana[${index}]`, {allowAppliesTo: true}));
    }
  }
  if (value.kanjiInfo !== undefined) {
    if (!Array.isArray(value.kanjiInfo)) {
      sink.add(`${path}.kanjiInfo`, "expected an array");
    } else {
      value.kanjiInfo.forEach((info, index) => {
        const infoPath = `${path}.kanjiInfo[${index}]`;
        if (!isPlainObject(info)) {
          sink.add(infoPath, "expected an object");
          return;
        }
        sink.checkKeys(info, new Set(["literal", "strokeCount", "onYomi", "kunYomi", "meanings", "jlpt"]), infoPath);
        if (typeof info.literal !== "string" || info.literal.length < 1 || info.literal.length > 2) {
          sink.add(`${infoPath}.literal`, "literal must be a single character");
        }
        if (info.strokeCount !== undefined && (!Number.isInteger(info.strokeCount) || (info.strokeCount as number) < 1)) {
          sink.add(`${infoPath}.strokeCount`, "expected a positive integer");
        }
        for (const key of ["onYomi", "kunYomi", "meanings"] as const) {
          if (info[key] !== undefined) {
            sink.checkStringArray(info[key], `${infoPath}.${key}`);
          }
        }
        if (info.jlpt !== undefined && (!Number.isInteger(info.jlpt) || (info.jlpt as number) < 1 || (info.jlpt as number) > 5)) {
          sink.add(`${infoPath}.jlpt`, "expected an integer between 1 and 5");
        }
      });
    }
  }
};

const validateMandarinExtension = (sink: ErrorSink, value: unknown, path: string) => {
  if (!isPlainObject(value)) {
    sink.add(path, "mandarin extension must be an object");
    return;
  }
  sink.checkKeys(value, new Set(["simplified", "traditional", "pinyin"]), path);
  if (value.simplified === undefined) {
    sink.add(`${path}.simplified`, "simplified is required");
  } else {
    sink.checkNonEmptyString(value.simplified, `${path}.simplified`);
  }
  if (value.traditional !== undefined) {
    sink.checkNonEmptyString(value.traditional, `${path}.traditional`);
  }
  if (value.pinyin === undefined) {
    sink.add(`${path}.pinyin`, "pinyin is required");
  } else {
    sink.checkStringArray(value.pinyin, `${path}.pinyin`, {minItems: 1, pattern: PINYIN_PATTERN, patternName: "pinyin"});
  }
};

const validateCantoneseExtension = (sink: ErrorSink, value: unknown, path: string) => {
  if (!isPlainObject(value)) {
    sink.add(path, "cantonese extension must be an object");
    return;
  }
  sink.checkKeys(value, new Set(["jyutping", "simplified", "traditional"]), path);
  if (value.jyutping === undefined) {
    sink.add(`${path}.jyutping`, "jyutping is required");
  } else {
    sink.checkStringArray(value.jyutping, `${path}.jyutping`, {minItems: 1, pattern: JYUTPING_PATTERN, patternName: "jyutping"});
  }
  for (const key of ["simplified", "traditional"] as const) {
    if (value[key] !== undefined) {
      sink.checkNonEmptyString(value[key], `${path}.${key}`);
    }
  }
};

const EXTENSION_VALIDATORS = {
  japanese: validateJapaneseExtension,
  mandarin: validateMandarinExtension,
  cantonese: validateCantoneseExtension,
} as const;

const validateEntry = (sink: ErrorSink, value: unknown, path: string, family: LanguageFamily) => {
  if (!isPlainObject(value)) {
    sink.add(path, "entry must be an object");
    return;
  }
  sink.checkKeys(value, ENTRY_KEYS, path);

  if (value.id === undefined) {
    sink.add(`${path}.id`, "id is required");
  } else if (!(typeof value.id === "string" && value.id.length > 0) &&
    !(Number.isInteger(value.id) && (value.id as number) >= 0)) {
    sink.add(`${path}.id`, "id must be a non-empty string or a non-negative integer");
  }

  if (value.headword === undefined) {
    sink.add(`${path}.headword`, "headword is required");
  } else {
    sink.checkNonEmptyString(value.headword, `${path}.headword`);
  }

  if (value.readings !== undefined) {
    sink.checkStringArray(value.readings, `${path}.readings`);
  }
  if (value.tags !== undefined) {
    sink.checkStringArray(value.tags, `${path}.tags`);
  }
  if (value.frequency !== undefined && (!Number.isInteger(value.frequency) || (value.frequency as number) < 0)) {
    sink.add(`${path}.frequency`, "expected a non-negative integer rank");
  }
  if (value.senses !== undefined) {
    if (!Array.isArray(value.senses)) {
      sink.add(`${path}.senses`, "expected an array");
    } else {
      value.senses.forEach((sense, index) => validateSense(
        sink, sense, `${path}.senses[${index}]`, {requirePartOfSpeech: family === "japanese"}
      ));
    }
  }

  // Language-specific part: only the extension matching the dictionary language is allowed.
  for (const key of EXTENSION_KEYS) {
    if (value[key] !== undefined && key !== family) {
      sink.add(`${path}.${key}`, `"${key}" data is not allowed in a ${family ?? "generic"} dictionary`);
    }
  }
  if (family && (family === "mandarin" || family === "cantonese") && value[family] === undefined) {
    sink.add(`${path}.${family}`, `"${family}" extension is required for ${family} entries`);
  }
  if (family && value[family] !== undefined) {
    EXTENSION_VALIDATORS[family](sink, value[family], `${path}.${family}`);
  }
};

export function validateDictionary(document: unknown): ValidationResult {
  const sink = new ErrorSink();

  if (!isPlainObject(document)) {
    sink.add("", "dictionary document must be an object");
    return {valid: false, errors: sink.errors};
  }

  sink.checkKeys(document, new Set(["version", "language", "name", "source", "entries"]), "");

  if (document.version === undefined) {
    sink.add("version", "version is required");
  } else if (typeof document.version !== "string" || !VERSION_PATTERN.test(document.version)) {
    sink.add("version", `expected a semantic version string like "1.0.0", got ${JSON.stringify(document.version)}`);
  }

  if (document.language === undefined) {
    sink.add("language", "language is required");
  } else if (typeof document.language !== "string" || !LANGUAGE_CODE_PATTERN.test(document.language)) {
    sink.add("language", `"${document.language}" is not a valid language code`);
  }

  if (document.name !== undefined) {
    sink.checkNonEmptyString(document.name, "name");
  }

  if (document.source !== undefined) {
    if (!isPlainObject(document.source)) {
      sink.add("source", "source must be an object");
    } else {
      sink.checkKeys(document.source, new Set(["name", "url", "license"]), "source");
      for (const key of ["name", "url", "license"] as const) {
        if (document.source[key] !== undefined) {
          sink.checkNonEmptyString(document.source[key], `source.${key}`);
        }
      }
    }
  }

  const family = getLanguageFamily(document.language);

  if (document.entries === undefined) {
    sink.add("entries", "entries is required");
  } else if (!Array.isArray(document.entries)) {
    sink.add("entries", "entries must be an array");
  } else {
    document.entries.forEach((entry, index) => validateEntry(sink, entry, `entries[${index}]`, family));
  }

  return {valid: sink.errors.length === 0, errors: sink.errors};
}
