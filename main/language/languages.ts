/**
 * The languages the language tools (main/mcp/languageTools.ts) take as `language`, and what each one
 * is inside Miteiru: the plugin that loads it, the tokenizer mode the analyzer runs, and the code its
 * saved words and Your dictionary entries are stored under (learningStateDB keys are `<code>/<word>`).
 *
 * Mandarin is one engine (CC-CEDICT and the Mandarin lattice) for both scripts: zh-Hans and zh-Hant
 * differ in which form of a CC-CEDICT entry a word must match and in the `script` a result reports.
 */
export const TOOL_LANGUAGES = ["ja", "zh-Hans", "zh-Hant", "yue", "vi"] as const;
export type ToolLanguage = typeof TOOL_LANGUAGES[number];

/** The codes Miteiru stores words under (renderer/languages/manifest.ts languageCodes). */
export type StoredLanguageCode = "ja" | "zh-CN" | "yue" | "vi";

export interface ToolLanguageInfo {
  id: ToolLanguage;
  code: StoredLanguageCode;
  name: string;
  pluginId: string;
  tokenizerMode: string;
  /** Han script the text is in; only Mandarin's two ids set it. */
  script?: "simplified" | "traditional";
}

const INFO: Record<ToolLanguage, ToolLanguageInfo> = {
  ja: {id: "ja", code: "ja", name: "Japanese", pluginId: "japanese-kuromoji", tokenizerMode: "kuromoji"},
  "zh-Hans": {id: "zh-Hans", code: "zh-CN", name: "Mandarin Chinese (simplified)", pluginId: "mandarin-jieba", tokenizerMode: "jieba", script: "simplified"},
  "zh-Hant": {id: "zh-Hant", code: "zh-CN", name: "Mandarin Chinese (traditional)", pluginId: "mandarin-jieba", tokenizerMode: "jieba", script: "traditional"},
  yue: {id: "yue", code: "yue", name: "Cantonese", pluginId: "cantonese-jieba", tokenizerMode: "cantonese"},
  vi: {id: "vi", code: "vi", name: "Vietnamese", pluginId: "vietnamese", tokenizerMode: "vietnamese"}
};

export const isToolLanguage = (value: unknown): value is ToolLanguage => (
  typeof value === "string" && (TOOL_LANGUAGES as readonly string[]).includes(value)
);

export const toolLanguageInfo = (id: ToolLanguage): ToolLanguageInfo => INFO[id];

/**
 * The tool language for one of Miteiru's stored codes (the learner's language). Mandarin is stored as
 * zh-CN, and the learner's subtitles may be in either script; simplified is the default.
 */
export const toolLanguageForCode = (code: string): ToolLanguage | null => {
  switch (code) {
    case "ja": return "ja";
    case "zh-CN": return "zh-Hans";
    case "yue": return "yue";
    case "vi": return "vi";
    default: return null;
  }
};

/** A Han character: CJK ideographs, their extensions and compatibility forms (々 and 〆 are Han too). */
export const HAN_CHARACTER = /\p{Script=Han}/u;
