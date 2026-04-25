import path from "path";
import fs from "node:fs";
import Japanese from "../japanese";
import Chinese from "../chinese";
import Vietnamese from "../vietnamese";
import {LanguagePlugin, LanguagePluginContext, LanguagePluginLoadResult} from "./types";

const languageAssetsRoot = path.join(__dirname, "language-assets");

const firstExistingPath = (...candidates: string[]) => (
  candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
);

const assetDirectory = (pluginId: string, relativePath: string, legacyDirectory: string) => firstExistingPath(
  path.join(languageAssetsRoot, pluginId, relativePath),
  legacyDirectory ? path.join(__dirname, legacyDirectory) : ""
);

const assetPath = (pluginId: string, relativePath: string, legacyPath: string) => firstExistingPath(
  path.join(languageAssetsRoot, pluginId, relativePath),
  path.join(__dirname, legacyPath)
);

const getHanCharacterCoreSettings = () => ({
  kanjiSvgPath: assetPath("han-character-core", "kanji", "kanji"),
  hanziSvgPath: assetPath("han-character-core", "hanzi", "hanzi"),
  wanikaniKanji: assetPath("han-character-core", "wanikani/kanji.json", "wanikani/kanji.json"),
  wanikaniRadical: assetPath("han-character-core", "wanikani/radical.json", "wanikani/radical.json")
});

const getJapaneseSettings = (appDataDirectory: string) => {
  const hanCharacterCore = getHanCharacterCoreSettings();

  return Japanese.getJapaneseSettings(appDataDirectory, {
    importWanikaniKanji: hanCharacterCore.wanikaniKanji,
    importWanikaniRadical: hanCharacterCore.wanikaniRadical,
    importKanjiDict: assetPath("japanese", "dict/kanjidic.json", "dict/kanjidic.json"),
    importDict: assetPath("japanese", "dict/jmdict.json", "dict/jmdict.json"),
    importBaseSVG: hanCharacterCore.kanjiSvgPath,
    kuromojiDictPath: assetDirectory("japanese", "dict", "dict")
  });
};

const getMandarinSettings = (appDataDirectory: string) => Chinese.getMandarinSettings(appDataDirectory, {
  jiebaDictPath: assetPath("mandarin", "chinese/zh.jieba.txt", "chinese/zh.jieba.txt"),
  importDict: assetPath("mandarin", "chinese/chinese.json", "chinese/chinese.json"),
  importBaseSVG: getHanCharacterCoreSettings().hanziSvgPath
});

const getCantoneseSettings = (appDataDirectory: string) => Chinese.getCantoneseSettings(appDataDirectory, {
  jiebaDictPath: assetPath("cantonese", "cantonese/yue.jieba.txt", "cantonese/yue.jieba.txt"),
  importDict: assetPath("cantonese", "cantonese/cantodict.json", "cantonese/cantodict.json"),
  importBaseSVG: getHanCharacterCoreSettings().hanziSvgPath
});

const getVietnameseSettings = (appDataDirectory: string) => Vietnamese.getVietnameseSettings(appDataDirectory, {
  dictPath: assetPath("vietnamese", "vietnamese/vnedict.txt", "vietnamese/vnedict.txt")
});

export const languagePlugins: LanguagePlugin[] = [
  {
    id: "han-character-core",
    kind: "resource",
    name: "Han Character Core",
    setup: async () => Japanese.setupHanCharacterCore({
      importWanikaniKanji: getHanCharacterCoreSettings().wanikaniKanji,
      importWanikaniRadical: getHanCharacterCoreSettings().wanikaniRadical,
      importBaseSVG: getHanCharacterCoreSettings().kanjiSvgPath
    })
  },
  {
    id: "japanese-kuromoji",
    kind: "language",
    name: "Kuromoji - Japanese",
    tokenizerMode: "kuromoji",
    languageCode: "ja",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Japanese.setup(getJapaneseSettings(appDataDirectory))
  },
  {
    id: "japanese-mecab",
    kind: "language",
    name: "Mecab - Japanese",
    tokenizerMode: "mecab",
    languageCode: "ja",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Japanese.setup(getJapaneseSettings(appDataDirectory))
  },
  {
    id: "cantonese-jieba",
    kind: "language",
    name: "Jieba - Cantonese",
    tokenizerMode: "cantonese",
    languageCode: "yue",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Chinese.setup(getCantoneseSettings(appDataDirectory))
  },
  {
    id: "mandarin-jieba",
    kind: "language",
    name: "Jieba - Chinese",
    tokenizerMode: "jieba",
    languageCode: "zh-CN",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Chinese.setup(getMandarinSettings(appDataDirectory))
  },
  {
    id: "vietnamese",
    kind: "language",
    name: "Vietnamese",
    tokenizerMode: "vietnamese",
    languageCode: "vi",
    setup: async ({appDataDirectory}) => Vietnamese.setup(getVietnameseSettings(appDataDirectory))
  }
];

export const startupChannelPluginIds: Record<string, string> = {
  loadKuromoji: "japanese-kuromoji",
  loadMecab: "japanese-mecab",
  loadCantonese: "cantonese-jieba",
  loadChinese: "mandarin-jieba",
  loadVietnamese: "vietnamese"
};

export const getLanguagePlugin = (pluginId: string) => languagePlugins.find(({id}) => id === pluginId);

export const loadLanguagePlugin = async (
  pluginId: string,
  context: LanguagePluginContext,
  loadedPluginIds: Set<string> = new Set()
): Promise<LanguagePluginLoadResult> => {
  if (loadedPluginIds.has(pluginId)) {
    return {ok: 1, message: "Setup is ready"};
  }

  const plugin = getLanguagePlugin(pluginId);
  if (!plugin) {
    return {ok: 0, message: `Unknown language plugin: ${pluginId}`};
  }

  for (const dependencyId of plugin.dependencies ?? []) {
    const dependencyResult = await loadLanguagePlugin(dependencyId, context, loadedPluginIds);
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
