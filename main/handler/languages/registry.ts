import path from "path";
import fsPromises from "node:fs/promises";
import {GZIP_SUFFIX, ZSTD_SUFFIX} from "../../helpers/assetFiles";
import {limiter} from "../../helpers/limiter";
import Japanese from "../japanese";
import Chinese, {cantoneseEngine, mandarinEngine} from "../chinese";
import Vietnamese from "../vietnamese";
import {LanguageEngineContext, LanguagePlugin, LanguagePluginContext, LanguagePluginLoadResult} from "./types";

const languageAssetsRoot = path.join(__dirname, "language-assets");

/**
 * A folder holding `<plugin>/…` language data. `plugins` lists the plugin folders a language pack
 * carries (its manifest entry); a root without it may hold any plugin, as the bundled folder does.
 */
export interface AssetRoot {
  dir: string;
  plugins?: string[];
}

type RootSpec = string | AssetRoot;

const asRoot = (root: RootSpec): AssetRoot => (typeof root === "string" ? {dir: root} : root);

/**
 * Where language data can be: the bundled language-assets folder first, then the `language-assets`
 * folder of each language pack the user installed (src-tauri/src/sys/langpack.rs). The app supplies
 * the provider; it is asked again each time a language loads, so a pack installed a moment ago counts.
 */
let assetRoots: AssetRoot[] = [{dir: languageAssetsRoot}];
let assetRootsProvider: () => Promise<RootSpec[]> = async () => [languageAssetsRoot];

export const setLanguageAssetRoots = (provider: () => Promise<RootSpec[]>) => {
  assetRootsProvider = provider;
};

const refreshAssetRoots = async () => {
  try {
    const seen = new Set<string>();
    assetRoots = (await assetRootsProvider()).map(asRoot).filter((root) => !seen.has(root.dir) && Boolean(seen.add(root.dir)));
  } catch (error) {
    console.error("[languages] could not list the installed language packs; using the bundled data only:", error);
    assetRoots = [{dir: languageAssetsRoot}];
  }
  if (assetRoots.length === 0) assetRoots = [{dir: languageAssetsRoot}];
};

const pathExists = (filePath: string) => fsPromises.access(filePath).then(() => true, () => false);

/**
 * Whether the asset is there in any form: the plain file, or its `.zst` or `.gz` copy (large files
 * packaged by scripts/compressLanguageAssets.js), or the data table that replaces it (`x.json` and a
 * folder `x` both become `x.pack`; docs/DATA_FORMAT.md). The forms are asked at once: in the app each
 * check is a round trip to Rust, and on macOS and Linux webviews asking them one after another made a
 * language take several seconds to load.
 */
export const assetCandidateExists = async (candidate: string) => {
  const table = `${candidate.replace(/\.json$/i, "")}.pack`;
  const forms = [candidate, candidate + ZSTD_SUFFIX, candidate + GZIP_SUFFIX, ...(table === candidate ? [] : [table])];
  return (await Promise.all(forms.map(pathExists))).some(Boolean);
};

/**
 * The first candidate that exists (all are asked at once); when none does, the first one, so the
 * error names the bundled location.
 */
export const firstExistingPath = async (...candidates: string[]) => {
  const found = await Promise.all(candidates.map((candidate) => (candidate ? assetCandidateExists(candidate) : Promise.resolve(false))));
  const index = found.indexOf(true);
  return index >= 0 ? candidates[index] : candidates[0];
};

/**
 * `relativePath` of a plugin in the first root that may hold it and has it, else under `__dirname` as
 * 7.x kept it. A pack's root is only asked for the plugins it carries.
 */
export const resolveAsset = async (roots: RootSpec[], pluginId: string, relativePath: string, legacyPath: string) => {
  const candidates = [
    ...roots.map(asRoot).filter((root) => !root.plugins || root.plugins.includes(pluginId)).map((root) => path.join(root.dir, pluginId, relativePath)),
    ...(legacyPath ? [path.join(__dirname, legacyPath)] : [])
  ];
  return candidates.length > 0 ? firstExistingPath(...candidates) : path.join(languageAssetsRoot, pluginId, relativePath);
};

const assetDirectory = (pluginId: string, relativePath: string, legacyDirectory: string) => resolveAsset(
  assetRoots, pluginId, relativePath, legacyDirectory
);

const assetPath = (pluginId: string, relativePath: string, legacyPath: string) => resolveAsset(
  assetRoots, pluginId, relativePath, legacyPath
);

// Each language's paths are resolved together: every lookup is a round trip to Rust in the app.
const getHanCharacterCoreSettings = async () => {
  const [kanjiSvgPath, hanziSvgPath, wanikaniKanji, wanikaniRadical] = await Promise.all([
    assetPath("han-character-core", "kanji", "kanji"),
    assetPath("han-character-core", "hanzi", "hanzi"),
    assetPath("han-character-core", "wanikani/kanji.json", "wanikani/kanji.json"),
    assetPath("han-character-core", "wanikani/radical.json", "wanikani/radical.json")
  ]);
  return {kanjiSvgPath, hanziSvgPath, wanikaniKanji, wanikaniRadical};
};

const getJapaneseSettings = async (appDataDirectory: string) => {
  const [hanCharacterCore, importKanjiDict, importDict, kuromojiDictPath] = await Promise.all([
    getHanCharacterCoreSettings(),
    assetPath("japanese", "dict/kanjidic.json", "dict/kanjidic.json"),
    assetPath("japanese", "dict/jmdict.json", "dict/jmdict.json"),
    assetDirectory("japanese", "dict", "dict")
  ]);

  return Japanese.getJapaneseSettings(appDataDirectory, {
    importWanikaniKanji: hanCharacterCore.wanikaniKanji,
    importWanikaniRadical: hanCharacterCore.wanikaniRadical,
    importKanjiDict,
    importDict,
    importBaseSVG: hanCharacterCore.kanjiSvgPath,
    kuromojiDictPath
  });
};

const getChineseSettings = async (pluginId: string, folder: string, jiebaFile: string, dictionaryFile: string) => {
  const [jiebaDictPath, importDict, hanzi] = await Promise.all([
    assetPath(pluginId, `${folder}/${jiebaFile}`, `${folder}/${jiebaFile}`),
    assetPath(pluginId, `${folder}/${dictionaryFile}`, `${folder}/${dictionaryFile}`),
    assetPath("han-character-core", "hanzi", "hanzi")
  ]);
  return {jiebaDictPath, importDict, importBaseSVG: hanzi};
};

const getMandarinSettings = async (appDataDirectory: string) => Chinese.getMandarinSettings(
  appDataDirectory, await getChineseSettings("mandarin", "chinese", "zh.jieba.txt", "chinese.json")
);

const getCantoneseSettings = async (appDataDirectory: string) => Chinese.getCantoneseSettings(
  appDataDirectory, await getChineseSettings("cantonese", "cantonese", "yue.jieba.txt", "cantodict.json")
);

const getVietnameseSettings = async (appDataDirectory: string) => Vietnamese.getVietnameseSettings(appDataDirectory, {
  dictPath: await assetPath("vietnamese", "vietnamese/vnedict.txt", "vietnamese/vnedict.txt")
});

const keyOf = async (settings: Promise<unknown>) => JSON.stringify(await settings);

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
    },
    engineKey: () => keyOf(getHanCharacterCoreSettings()),
    engineReady: () => Japanese.wanikanji !== undefined
  },
  {
    id: "japanese-kuromoji",
    kind: "language",
    name: "Kuromoji - Japanese",
    tokenizerMode: "kuromoji",
    languageCode: "ja",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Japanese.setup(await getJapaneseSettings(appDataDirectory)),
    engineKey: ({appDataDirectory}) => keyOf(getJapaneseSettings(appDataDirectory)),
    engineReady: () => Boolean(Japanese.Dict.db && Japanese.KanjiDict.db)
  },
  {
    id: "cantonese-jieba",
    kind: "language",
    name: "Jieba - Cantonese",
    tokenizerMode: "cantonese",
    languageCode: "yue",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Chinese.setup(await getCantoneseSettings(appDataDirectory)),
    setupEngine: async ({appDataDirectory}) => cantoneseEngine.setup(await getCantoneseSettings(appDataDirectory)),
    engineKey: ({appDataDirectory}) => keyOf(getCantoneseSettings(appDataDirectory)),
    engineReady: () => Boolean(cantoneseEngine.Dict.db && cantoneseEngine.jieba)
  },
  {
    id: "mandarin-jieba",
    kind: "language",
    name: "Jieba - Chinese",
    tokenizerMode: "jieba",
    languageCode: "zh-CN",
    dependencies: ["han-character-core"],
    setup: async ({appDataDirectory}) => Chinese.setup(await getMandarinSettings(appDataDirectory)),
    setupEngine: async ({appDataDirectory}) => mandarinEngine.setup(await getMandarinSettings(appDataDirectory)),
    engineKey: ({appDataDirectory}) => keyOf(getMandarinSettings(appDataDirectory)),
    engineReady: () => Boolean(mandarinEngine.Dict.db && mandarinEngine.jieba)
  },
  {
    id: "vietnamese",
    kind: "language",
    name: "Vietnamese",
    tokenizerMode: "vietnamese",
    languageCode: "vi",
    setup: async ({appDataDirectory}) => Vietnamese.setup(await getVietnameseSettings(appDataDirectory)),
    engineKey: ({appDataDirectory}) => keyOf(getVietnameseSettings(appDataDirectory)),
    engineReady: () => Vietnamese.isLoaded
  }
];

export const startupChannelPluginIds: Record<string, string> = {
  loadKuromoji: "japanese-kuromoji",
  loadCantonese: "cantonese-jieba",
  loadChinese: "mandarin-jieba",
  loadVietnamese: "vietnamese"
};

/** The Kuromoji dictionary folder of the Japanese data on this computer (bundled or a pack), for the preload. */
export const japaneseDictionaryFolder = async (): Promise<string> => {
  await refreshAssetRoots();
  return assetDirectory("japanese", "dict", "dict");
};

export const getLanguagePlugin = (pluginId: string) => languagePlugins.find(({id}) => id === pluginId);

export const getLanguagePluginByTokenizerMode = (tokenizerMode: string) => (
  languagePlugins.find((plugin) => plugin.tokenizerMode === tokenizerMode)
);

// Home never starts two loads, but an AI assistant (main/mcp) can load a language while the learner
// picks one, and two first-time setups of one language must not run together.
const oneLoadAtATime = limiter(1);

/** Loads a language and its dependencies; a load asked for while another runs waits for it to finish. */
export const loadLanguagePlugin = (
  pluginId: string,
  context: LanguagePluginContext,
  loadedPluginIds: Set<string> = new Set()
): Promise<LanguagePluginLoadResult> => oneLoadAtATime(async () => {
  await refreshAssetRoots();
  return loadPlugin(pluginId, context, loadedPluginIds);
});

/**
 * Loads a language unless `skip()` says no once its turn comes (another load got a language in first);
 * null when skipped. Deciding in its turn leaves no gap for a load the learner starts meanwhile.
 */
export const loadLanguagePluginUnless = (
  skip: () => boolean,
  pluginId: string,
  context: LanguagePluginContext
): Promise<LanguagePluginLoadResult | null> => oneLoadAtATime(async () => {
  if (skip()) return null;
  await refreshAssetRoots();
  return loadPlugin(pluginId, context, new Set());
});

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
  await rememberEngine(plugin, context);

  loadedPluginIds.add(plugin.id);

  if (plugin.tokenizerMode) {
    context.setTokenizer(plugin.tokenizerMode);
  }

  return {ok: 1, message: "Setup is ready"};
};

// ---- Engines for the language tools --------------------------------------------------------------

/** The data each plugin was last set up with (engineKey), by Home or by the tools. */
const engineKeys = new Map<string, string>();

const rememberEngine = async (plugin: LanguagePlugin, context: LanguageEngineContext) => {
  if (!plugin.engineKey) return;
  try {
    engineKeys.set(plugin.id, await plugin.engineKey(context));
  } catch {
    engineKeys.delete(plugin.id);
  }
};

const loadEngine = async (
  pluginId: string,
  context: LanguageEngineContext,
  loadedPluginIds: Set<string>
): Promise<LanguagePluginLoadResult> => {
  if (loadedPluginIds.has(pluginId)) return {ok: 1, message: "Setup is ready"};
  const plugin = getLanguagePlugin(pluginId);
  if (!plugin) return {ok: 0, message: `Unknown language plugin: ${pluginId}`};
  for (const dependencyId of plugin.dependencies ?? []) {
    const dependencyResult = await loadEngine(dependencyId, context, loadedPluginIds);
    if (!dependencyResult.ok) return dependencyResult;
  }
  const key = plugin.engineKey ? await plugin.engineKey(context) : null;
  const ready = key !== null && plugin.engineReady?.() === true && engineKeys.get(plugin.id) === key;
  if (!ready) {
    const setup = plugin.setupEngine ?? plugin.setup;
    const error = setup ? await setup({...context, setTokenizer: () => undefined}) : null;
    if (error) return {ok: 0, message: error};
    if (key !== null) engineKeys.set(plugin.id, key);
  }
  loadedPluginIds.add(plugin.id);
  return {ok: 1, message: "Setup is ready"};
};

/**
 * Loads a language's dictionaries and tokenizer for the language tools (main/mcp/languageTools.ts)
 * without making it the learner's language: Home's tokenizer setting and the word popup's Chinese stay
 * as they are. A language already set up from the same data (by Home or an earlier call) is not set up
 * again. Runs in turn with Home's loads, so no two setups of one language overlap.
 */
export const loadLanguageEngine = (pluginId: string, context: LanguageEngineContext): Promise<LanguagePluginLoadResult> => (
  oneLoadAtATime(async () => {
    await refreshAssetRoots();
    return loadEngine(pluginId, context, new Set());
  })
);

/** The file whose presence says a language's data is on this computer (bundled or an installed pack). */
const LANGUAGE_MARKERS: Record<string, [string, string]> = {
  "japanese-kuromoji": ["japanese", "dict/base.dat"],
  "mandarin-jieba": ["mandarin", "chinese/zh.jieba.txt"],
  "cantonese-jieba": ["cantonese", "cantonese/yue.jieba.txt"],
  vietnamese: ["vietnamese", "vietnamese/vnedict.txt"]
};

/** Whether the language's data is installed, without loading it. */
export const languageDataPresent = async (pluginId: string): Promise<boolean> => {
  const marker = LANGUAGE_MARKERS[pluginId];
  if (!marker) return false;
  await refreshAssetRoots();
  const [folder, relative] = marker;
  const candidates = assetRoots.filter((root) => !root.plugins || root.plugins.includes(folder))
    .map((root) => path.join(root.dir, folder, relative));
  return (await Promise.all(candidates.map(assetCandidateExists))).some(Boolean);
};
