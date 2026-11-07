import path from "path";
import {assetExists} from "../../helpers/assetFiles";
import Japanese from "../japanese";
import Chinese from "../chinese";
import Vietnamese from "../vietnamese";
import {LanguagePlugin, LanguagePluginContext, LanguagePluginLoadResult} from "./types";

const languageAssetsRoot = path.join(__dirname, "language-assets");

/**
 * Where language data can be: the bundled language-assets folder first, then the `language-assets`
 * folder of each language pack the user installed (src-tauri/src/sys/langpack.rs). The app supplies
 * the provider; it is asked again each time a language loads, so a pack installed a moment ago counts.
 */
let assetRoots: string[] = [languageAssetsRoot];
let assetRootsProvider: () => Promise<string[]> = async () => [languageAssetsRoot];

export const setLanguageAssetRoots = (provider: () => Promise<string[]>) => {
  assetRootsProvider = provider;
};

const refreshAssetRoots = async () => {
  try {
    assetRoots = [...new Set(await assetRootsProvider())];
  } catch (error) {
    console.error("[languages] could not list the installed language packs; using the bundled data only:", error);
    assetRoots = [languageAssetsRoot];
  }
  if (assetRoots.length === 0) assetRoots = [languageAssetsRoot];
};

/**
 * Whether the asset is there in any form: the plain file, or its `.zst` or `.gz` copy (large files
 * packaged by scripts/compressLanguageAssets.js), or the data table that replaces it (`x.json` and a
 * folder `x` both become `x.pack`; docs/DATA_FORMAT.md).
 */
export const assetCandidateExists = async (candidate: string) => (
  await assetExists(candidate) || await assetExists(`${candidate.replace(/\.json$/i, "")}.pack`)
);

/** The first candidate that exists; when none does, the first one, so the error names the bundled location. */
export const firstExistingPath = async (...candidates: string[]) => {
  for (const candidate of candidates) {
    if (candidate && await assetCandidateExists(candidate)) return candidate;
  }
  return candidates[0];
};

/** `relativePath` of a plugin in the first root that has it, else under `__dirname` as 7.x kept it. */
export const resolveAsset = (roots: string[], pluginId: string, relativePath: string, legacyPath: string) => firstExistingPath(
  ...roots.map((root) => path.join(root, pluginId, relativePath)),
  ...(legacyPath ? [path.join(__dirname, legacyPath)] : [])
);

const assetDirectory = (pluginId: string, relativePath: string, legacyDirectory: string) => resolveAsset(
  assetRoots, pluginId, relativePath, legacyDirectory
);

const assetPath = (pluginId: string, relativePath: string, legacyPath: string) => resolveAsset(
  assetRoots, pluginId, relativePath, legacyPath
);

const getHanCharacterCoreSettings = async () => ({
  kanjiSvgPath: await assetPath("han-character-core", "kanji", "kanji"),
  hanziSvgPath: await assetPath("han-character-core", "hanzi", "hanzi"),
  wanikaniKanji: await assetPath("han-character-core", "wanikani/kanji.json", "wanikani/kanji.json"),
  wanikaniRadical: await assetPath("han-character-core", "wanikani/radical.json", "wanikani/radical.json")
});

const getJapaneseSettings = async (appDataDirectory: string) => {
  const hanCharacterCore = await getHanCharacterCoreSettings();

  return Japanese.getJapaneseSettings(appDataDirectory, {
    importWanikaniKanji: hanCharacterCore.wanikaniKanji,
    importWanikaniRadical: hanCharacterCore.wanikaniRadical,
    importKanjiDict: await assetPath("japanese", "dict/kanjidic.json", "dict/kanjidic.json"),
    importDict: await assetPath("japanese", "dict/jmdict.json", "dict/jmdict.json"),
    importBaseSVG: hanCharacterCore.kanjiSvgPath,
    kuromojiDictPath: await assetDirectory("japanese", "dict", "dict")
  });
};

const getMandarinSettings = async (appDataDirectory: string) => Chinese.getMandarinSettings(appDataDirectory, {
  jiebaDictPath: await assetPath("mandarin", "chinese/zh.jieba.txt", "chinese/zh.jieba.txt"),
  importDict: await assetPath("mandarin", "chinese/chinese.json", "chinese/chinese.json"),
  importBaseSVG: (await getHanCharacterCoreSettings()).hanziSvgPath
});

const getCantoneseSettings = async (appDataDirectory: string) => Chinese.getCantoneseSettings(appDataDirectory, {
  jiebaDictPath: await assetPath("cantonese", "cantonese/yue.jieba.txt", "cantonese/yue.jieba.txt"),
  importDict: await assetPath("cantonese", "cantonese/cantodict.json", "cantonese/cantodict.json"),
  importBaseSVG: (await getHanCharacterCoreSettings()).hanziSvgPath
});

const getVietnameseSettings = async (appDataDirectory: string) => Vietnamese.getVietnameseSettings(appDataDirectory, {
  dictPath: await assetPath("vietnamese", "vietnamese/vnedict.txt", "vietnamese/vnedict.txt")
});

export const languagePlugins: LanguagePlugin[] = [
  {
    id: "han-character-core",
    kind: "resource",
    name: "Han Character Core",
    setup: async () => {
      const settings = await getHanCharacterCoreSettings();
      return Japanese.setupHanCharacterCore({
        importWanikaniKanji: settings.wanikaniKanji,
        importWanikaniRadical: settings.wanikaniRadical,
        importBaseSVG: settings.kanjiSvgPath
      });
    }
  },
  {
    id: "japanese-kuromoji",
    kind: "language",
    name: "Kuromoji - Japanese",
    tokenizerMode: "kuromoji",
    languageCode: "ja",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Japanese.setup(await getJapaneseSettings(appDataDirectory))
  },
  {
    id: "cantonese-jieba",
    kind: "language",
    name: "Jieba - Cantonese",
    tokenizerMode: "cantonese",
    languageCode: "yue",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Chinese.setup(await getCantoneseSettings(appDataDirectory))
  },
  {
    id: "mandarin-jieba",
    kind: "language",
    name: "Jieba - Chinese",
    tokenizerMode: "jieba",
    languageCode: "zh-CN",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Chinese.setup(await getMandarinSettings(appDataDirectory))
  },
  {
    id: "vietnamese",
    kind: "language",
    name: "Vietnamese",
    tokenizerMode: "vietnamese",
    languageCode: "vi",
    setup: async ({appDataDirectory}) => Vietnamese.setup(await getVietnameseSettings(appDataDirectory))
  }
];

export const startupChannelPluginIds: Record<string, string> = {
  loadKuromoji: "japanese-kuromoji",
  loadCantonese: "cantonese-jieba",
  loadChinese: "mandarin-jieba",
  loadVietnamese: "vietnamese"
};

export const getLanguagePlugin = (pluginId: string) => languagePlugins.find(({id}) => id === pluginId);

export const getLanguagePluginByTokenizerMode = (tokenizerMode: string) => (
  languagePlugins.find((plugin) => plugin.tokenizerMode === tokenizerMode)
);

export const loadLanguagePlugin = async (
  pluginId: string,
  context: LanguagePluginContext,
  loadedPluginIds: Set<string> = new Set()
): Promise<LanguagePluginLoadResult> => {
  await refreshAssetRoots();
  return loadPlugin(pluginId, context, loadedPluginIds);
};

const loadPlugin = async (
  pluginId: string,
  context: LanguagePluginContext,
  loadedPluginIds: Set<string>
): Promise<LanguagePluginLoadResult> => {
  if (loadedPluginIds.has(pluginId)) {
    return {ok: 1, message: "Setup is ready"};
  }

  const plugin = getLanguagePlugin(pluginId);
  if (!plugin) {
    return {ok: 0, message: `Unknown language plugin: ${pluginId}`};
  }

  for (const dependencyId of plugin.dependencies ?? []) {
    const dependencyResult = await loadPlugin(dependencyId, context, loadedPluginIds);
    if (!dependencyResult.ok) return dependencyResult;
  }

  const error = plugin.setup ? await plugin.setup(context) : null;
  if (error) {
    return {ok: 0, message: error};
  }

  loadedPluginIds.add(plugin.id);

  if (plugin.tokenizerMode) {
    context.setTokenizer(plugin.tokenizerMode);
  }

  return {ok: 1, message: "Setup is ready"};
};
