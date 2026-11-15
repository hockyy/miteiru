import Japanese from "../handler/japanese";
import {cantoneseEngine, mandarinEngine} from "../handler/chinese";
import Vietnamese from "../handler/vietnamese";
import {analyzeText} from "../handler/languages/analyzer";
import {languageDataPresent, languageEngineState, loadLanguageEngine} from "../handler/languages/registry";
import Learning from "../handler/learning";
import {enabledUserDictionaryEntries} from "../helpers/userDictionary";
import {readStrokeSvg} from "../helpers/strokeSvg";
import {TOOL_LANGUAGES, toolLanguageForCode, toolLanguageInfo} from "../language/languages";
import {loadHskWords, loadJapaneseLevels, loadPitchAccents} from "../language/studyData";
import type {LanguageToolDeps} from "./languageTools";
import {ToolError} from "./protocol";

export interface LanguageDepsContext {
  appDataDirectory: string;
  /** The learner's language as Miteiru stores it (ja, zh-CN, yue, vi), or null when none is chosen. */
  learnerLanguage: () => Promise<string | null>;
  /** Saved words of a language changed (set_word_levels): the app tells its window to reload them. */
  onSavedWordsChanged?: (code: string) => void;
}

/**
 * The language tools' view of Miteiru's engines: the same tokenizers, dictionaries, saved words and Your
 * dictionary the subtitles use. The app's backend worker and the headless server both build theirs here.
 */
export const createLanguageDeps = ({appDataDirectory, learnerLanguage, onSavedWordsChanged}: LanguageDepsContext): LanguageToolDeps => ({
  defaultLanguage: async () => toolLanguageForCode((await learnerLanguage()) ?? ""),

  ensureLanguage: async (language) => {
    const info = toolLanguageInfo(language);
    const result = await loadLanguageEngine(info.pluginId, {appDataDirectory});
    if (result.ok === 1) return;
    if (!await languageDataPresent(info.pluginId)) {
      throw new ToolError(`${info.name} isn't installed on this computer. Open Miteiru and choose it on the Home screen once, which downloads its language pack.`, 409);
    }
    throw new ToolError(`Miteiru couldn't load ${info.name}: ${result.message}`, 409);
  },

  analyze: (language, text, toneType = "num") => analyzeText(text, {tokenizerMode: toolLanguageInfo(language).tokenizerMode, toneType}),

  jmdict: () => Japanese.Dict.db,
  jmdictTags: () => Japanese.Dict.tags ?? {},
  kanjidic: () => Japanese.KanjiDict.db,
  chineseDictionary: (code) => (code === "yue" ? cantoneseEngine : mandarinEngine).Dict.db,
  vietnameseDictionary: () => (Vietnamese.isLoaded ? Vietnamese.dictionary : null),

  strokeSvg: async (set, character) => {
    const codepoint = character.codePointAt(0);
    if (codepoint === undefined) return "";
    // KanjiVG files are named by 5-digit hex code point (065e5.svg), Make Me a Hanzi's by decimal (26085.svg).
    if (set === "kanji") return Japanese.importBaseSVG ? readStrokeSvg(Japanese.importBaseSVG, `${codepoint.toString(16).padStart(5, "0")}.svg`) : "";
    const folder = mandarinEngine.importBaseSVG || cantoneseEngine.importBaseSVG;
    return folder ? readStrokeSvg(folder, `${codepoint}.svg`) : "";
  },

  savedWords: (code) => Learning.loadState(code),
  saveWordLevels: async (code, entries) => {
    await Learning.updateContentBatch(entries, code);
    onSavedWordsChanged?.(code);
  },
  userWords: (code) => enabledUserDictionaryEntries(code),

  pitchAccents: loadPitchAccents,
  hskWords: loadHskWords,
  japaneseLevels: loadJapaneseLevels
});

/** For get_status: each tool language's data installed, and its engine loaded now. */
export const languageStates = async (): Promise<Record<string, {installed: boolean; loaded: boolean}>> => (
  Object.fromEntries(await Promise.all(TOOL_LANGUAGES.map(async (id) => [id, await languageEngineState(toolLanguageInfo(id).pluginId)] as const)))
);
