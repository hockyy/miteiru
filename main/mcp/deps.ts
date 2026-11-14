import fs from "fs/promises";
import {BrowserWindow} from "../../renderer/platform/backend/shims/desktop";
import {LANGUAGE_LOADED_EVENT} from "../../renderer/platform/platformApiChannels";
import {getLanguageModeByTokenizerMode, languageModes} from "../../renderer/languages/manifest";
import {LAST_VIDEO_KEY, type LastVideo} from "../../renderer/utils/continueWatching";
import {analyzeText} from "../handler/languages/analyzer";
import {loadLanguagePluginUnless} from "../handler/languages/registry";
import {getStore} from "../handler/common/storeHandlers";
import {requireMediaTool, toolIsInstalled} from "../handler/common/mediaTools";
import {sys} from "../../renderer/platform/backend/sys";
import {downloadSubtitle, runYtDlp, youtubeCaptionInfo} from "../handler/common/youtubeHandlers";
import Learning from "../handler/learning";
import type {LearningLanguage, MiteiruToolDeps} from "./tools";
import {requestOpenVideo} from "./windowRequests";

/** Where the home screen remembers the language the learner picked last: a manifest mode id. */
const LAST_LANGUAGE_KEY = "app.lastLanguageMode";
const SEARCH_TIMEOUT_MS = 45_000;
// A description takes a few seconds; one stalled past this frees its place among the tools' YouTube
// runs (main/mcp/tools.ts) instead of holding it for yt-dlp's usual 2 minutes.
const VIDEO_INFO_TIMEOUT_MS = 40_000;

const toLanguage = (mode: (typeof languageModes)[number]): LearningLanguage => ({
  code: mode.languageCode,
  name: mode.englishName,
  tokenizerMode: mode.tokenizerMode,
  pluginId: mode.pluginId
});

export interface MiteiruToolDepsContext {
  appDataDirectory: string;
  version: string;
  getTokenizer: () => string;
  setTokenizer: (tokenizerMode: string) => void;
  getToneType: () => Promise<string>;
}

/** The tools' view of Miteiru: its loaded language, saved words, yt-dlp and the window. */
export const createMiteiruToolDeps = ({
  appDataDirectory,
  version,
  getTokenizer,
  setTokenizer,
  getToneType
}: MiteiruToolDepsContext): MiteiruToolDeps => ({
  version,

  loadedLanguage: () => {
    const mode = getLanguageModeByTokenizerMode(getTokenizer());
    return mode ? toLanguage(mode) : null;
  },

  rememberedLanguage: async () => {
    const stored = (await getStore()).get(LAST_LANGUAGE_KEY, null);
    // Mode 1 was removed; the home screen opens Japanese in its place.
    const id = stored === 1 ? 0 : stored;
    const mode = languageModes.find((candidate) => candidate.id === id);
    return mode ? toLanguage(mode) : null;
  },

  loadLanguage: async (language) => {
    // The learner may be loading a language from Home right now; if it gets in first, that one is used.
    const result = await loadLanguagePluginUnless(() => Boolean(getTokenizer()), language.pluginId, {appDataDirectory, setTokenizer});
    if (!result) return;
    if (result.ok !== 1) throw new Error(result.message);
    // The page remembers the languages it loads, to load them again after a reload; this one it didn't ask for.
    const channel = languageModes.find((mode) => mode.pluginId === language.pluginId)?.channel;
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(LANGUAGE_LOADED_EVENT, channel));
  },

  analyze: async (text) => analyzeText(text, {tokenizerMode: getTokenizer(), toneType: await getToneType()}),

  savedWords: (languageCode) => Learning.loadState(languageCode),

  lastVideo: async () => {
    const stored = (await getStore()).get(LAST_VIDEO_KEY, null) as LastVideo | null;
    return stored && typeof stored.path === "string" && stored.path && typeof stored.position === "number" ? stored : null;
  },

  ytDlpAvailable: () => toolIsInstalled("yt-dlp", (command) => sys("proc_which", {name: command}) as Promise<string | null>),

  searchYoutube: async (url, count) => {
    const ytDlp = await requireMediaTool("yt-dlp");
    // Well inside the 2 minutes the local API waits for an answer, with time left to check captions.
    const output = await runYtDlp(ytDlp, ["--flat-playlist", "-J", "--no-warnings", "--playlist-end", String(count), url], SEARCH_TIMEOUT_MS);
    try {
      return JSON.parse(output);
    } catch {
      throw new Error("yt-dlp returned search results that could not be read.");
    }
  },

  videoInfo: (videoId) => youtubeCaptionInfo(videoId, VIDEO_INFO_TIMEOUT_MS),

  captionText: async (videoId, code) => {
    const {filePath} = await downloadSubtitle(videoId, code, (id) => youtubeCaptionInfo(id, VIDEO_INFO_TIMEOUT_MS));
    return fs.readFile(filePath, "utf8");
  },

  openInWindow: (request) => requestOpenVideo(request)
});
