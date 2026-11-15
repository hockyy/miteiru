import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {setSys} from "../../renderer/platform/backend/sys";
import {initRuntime} from "../../renderer/platform/backend/shims/runtime";
import {setStoreFactory} from "../handler/common/storeHandlers";
import {languageEngineState, loadLanguageEngine, setLanguageAssetRoots} from "../handler/languages/registry";
import Learning from "../handler/learning";
import {TOOL_LANGUAGES, toolLanguageForCode, toolLanguageInfo} from "../language/languages";
import {setStudyDataRoots} from "../language/studyData";
import {createMiteiruToolDeps} from "../mcp/deps";
import {createLanguageDeps} from "../mcp/languageDeps";
import {errorMessage, ToolError, type ToolCall} from "../mcp/protocol";
import {createMiteiruTools, type MiteiruToolDeps} from "../mcp/tools";
import {createAppProxy} from "./appProxy";
import {KvStore} from "./kvStore";
import {defaultAddonPath, loadAddon} from "./nativeAddon";
import {createNodeSys} from "./nodeSys";
import {installedPackRoots, registrationDirs, resolveProfile} from "./profile";
import {SettingsStore} from "./settingsStore";
import {serveStdio} from "./stdioServer";

/**
 * Miteiru's headless language server: the MCP tools over stdin and stdout, run in Node with the app's own
 * code (main/) and the app's own Rust tokenizers and tables (the miteiru-node addon), reading the
 * learner's installed language packs, settings and saved words. It never opens a window. Started by
 * scripts/miteiru-mcp.mjs; docs/LOCAL_API.md has the command line.
 */
export interface HeadlessOptions {
  /** The checkout: package.json, renderer/public (study data) and native/rust/target (the addon). */
  repoRoot: string;
  /** A profile folder instead of the installed app's (as MITEIRU_USER_DATA_DIR). */
  profile?: string;
  /** Read a development build's profile ("miteiru (development)"). */
  development?: boolean;
  addonPath?: string;
  /** More folders holding `<plugin>/…` language data, searched before the installed packs. */
  assets?: string[];
  /** Languages to load at start, before any call asks: "learner" (the default), "all" or "none". */
  preload?: "learner" | "all" | "none";
  /** Hand open_video and set_word_levels to a running Miteiru when there is one (default true). */
  proxy?: boolean;
  input?: NodeJS.ReadableStream;
  write?: (line: string) => void;
}

const log = (...parts: unknown[]) => console.error("[miteiru-headless]", ...parts);

/** Nothing but MCP messages may reach stdout: everything the app's code logs goes to stderr. */
const routeConsoleToStderr = () => {
  for (const method of ["log", "info", "warn", "debug"] as const) {
    console[method] = (...parts: unknown[]) => console.error(...parts);
  }
  // node:sqlite is still marked experimental in Node 22: its warning is noise for an MCP client.
  const emit = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning?.message;
    if (/SQLite is an experimental feature/.test(String(text))) return;
    return (emit as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
};

const readVersion = (repoRoot: string) => {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version ?? "");
  } catch {
    return "";
  }
};

export const startHeadless = async (options: HeadlessOptions): Promise<void> => {
  routeConsoleToStderr();
  const started = performance.now();
  const {repoRoot} = options;
  const profile = resolveProfile({profile: options.profile, development: options.development});
  const version = readVersion(repoRoot);
  log(`profile ${profile.userData}, language packs ${profile.languagePacks}`);

  // The addon and SQLite: a failure here is told to every tool call, while the handshake still works.
  let setupError: string | null = null;
  // Loaded only now, after the warning filter above, so its "experimental" warning never prints.
  const kv = new KvStore((file) => {
    const {DatabaseSync} = process.getBuiltinModule("node:sqlite") as {DatabaseSync: new (file: string) => any};
    return new DatabaseSync(file);
  });
  try {
    const addon = loadAddon(options.addonPath ?? defaultAddonPath(repoRoot));
    setSys(createNodeSys(addon, kv));
  } catch (error) {
    setupError = errorMessage(error);
    log(setupError);
  }

  initRuntime({
    platform: process.platform as "win32" | "darwin" | "linux",
    arch: process.arch === "arm64" ? "arm64" : "x64",
    release: os.release(),
    version,
    userData: profile.userData,
    temp: os.tmpdir(),
    home: os.homedir(),
    resources: repoRoot,
    exePath: process.execPath,
    isPackaged: false,
    pid: process.pid
  });
  const settings = new SettingsStore(path.join(profile.userData, "config.json"));
  setStoreFactory(async () => settings as never);
  const extraAssets = (options.assets ?? []).map((dir) => ({dir: path.resolve(dir)}));
  setLanguageAssetRoots(async () => [...extraAssets, ...installedPackRoots(profile.languagePacks)]);
  setStudyDataRoots([path.join(repoRoot, "renderer", "public")]);
  if (!setupError) Learning.setup();

  // A dictionary cache of its own (used only by data shipped as JSON): nothing in the profile is deleted.
  const cache = path.join(os.tmpdir(), "miteiru-headless", crypto.createHash("sha256").update(profile.userData).digest("hex").slice(0, 12));
  let tokenizerMode = "";
  const getToneType = async () => String(settings.get("toneType", "num"));
  const base = createMiteiruToolDeps({
    appDataDirectory: cache,
    version,
    getTokenizer: () => tokenizerMode,
    setTokenizer: (mode) => {
      tokenizerMode = mode;
    },
    getToneType
  });
  const proxy = options.proxy === false ? null : createAppProxy(registrationDirs(profile, {profile: options.profile, development: options.development}));
  const learnerCode = async () => (base.loadedLanguage() ?? await base.rememberedLanguage())?.code ?? null;
  const language = createLanguageDeps({appDataDirectory: cache, learnerLanguage: learnerCode});

  const deps: MiteiruToolDeps = {
    ...base,
    // The learner's language, loaded the way the language tools load one: never twice.
    loadLanguage: async (learning) => {
      const result = await loadLanguageEngine(learning.pluginId, {appDataDirectory: cache});
      if (result.ok !== 1) throw new Error(result.message);
      tokenizerMode = learning.tokenizerMode;
    },
    openInWindow: async () => {
      throw new ToolError("Miteiru isn't open. open_video plays the video in Miteiru's window: ask the learner to open Miteiru, then try again.", 409);
    },
    language,
    toneType: getToneType,
    languages: async () => Object.fromEntries(await Promise.all(TOOL_LANGUAGES.map(async (id) => [id, await languageEngineState(toolLanguageInfo(id).pluginId)] as const))),
    server: "headless"
  };
  const tools = createMiteiruTools(deps);

  const callTool: ToolCall = async (name, args) => {
    if (setupError) throw new ToolError(setupError, 503);
    if (name === "open_video") {
      const outcome = proxy ? await proxy.call(name, args) : {answered: false as const, reason: "not-open" as const};
      if (!outcome.answered) return tools.open_video(args);
      if (outcome.error) throw new ToolError(outcome.error, 409);
      return outcome.result as object;
    }
    if (name === "set_word_levels" && proxy) {
      // In the app the change reaches its window at once; an app from before this tool, or none, gets it written here.
      const outcome = await proxy.call(name, args);
      if (outcome.answered) {
        if (outcome.error) throw new ToolError(outcome.error, 409);
        return outcome.result as object;
      }
    }
    return tools[name](args);
  };

  const preload = options.preload ?? "learner";
  if (!setupError && preload !== "none") {
    void (async () => {
      const ids = preload === "all"
        ? [...new Set(TOOL_LANGUAGES.map((id) => toolLanguageInfo(id).pluginId))]
        : [(await learnerCode().then((code) => toolLanguageForCode(code ?? ""))) ?? null].filter(Boolean).map((id) => toolLanguageInfo(id!).pluginId);
      for (const pluginId of ids) {
        if (!(await languageEngineState(pluginId)).installed) continue;
        const loadStarted = performance.now();
        const result = await loadLanguageEngine(pluginId, {appDataDirectory: cache}).catch((error) => ({ok: 0, message: errorMessage(error)}));
        log(`${pluginId}: ${result.ok === 1 ? `ready in ${Math.round(performance.now() - loadStarted)} ms` : result.message}`);
      }
    })();
  }

  log(`listening on stdio (${Math.round(performance.now() - started)} ms to start)`);
  await serveStdio(
    {input: options.input ?? process.stdin, write: options.write ?? ((line) => process.stdout.write(`${line}\n`))},
    callTool,
    version
  );
  kv.closeAll();
};
