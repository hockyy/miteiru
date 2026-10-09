import os from "os";
import path from "path";

export type LiveCaptionsRuntime = {
  platform: NodeJS.Platform | string;
  arch: string;
  release: string;
};

export type LiveCaptionsBridgeLookup = {
  platform?: NodeJS.Platform | string;
  resourcesPath?: string;
  cwd?: string;
  appPath?: string;
};

/** Darwin 25 is macOS 26 Tahoe, the first release we verified AXLiveCaptions against. */
export const MAC_LIVE_CAPTIONS_MIN_DARWIN_MAJOR = 25;

export const getLiveCaptionsRuntime = (): LiveCaptionsRuntime => ({
  platform: process.platform,
  arch: process.arch,
  release: os.release()
});

export const isLiveCaptionsSupported = (
  runtime: LiveCaptionsRuntime = getLiveCaptionsRuntime()
): boolean => {
  if (runtime.platform === "win32") return true;
  if (runtime.platform !== "darwin") return false;
  if (runtime.arch !== "arm64") return false;

  const major = Number.parseInt(String(runtime.release).split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= MAC_LIVE_CAPTIONS_MIN_DARWIN_MAJOR;
};

export const getLiveCaptionsBridgeExecutableName = (
  platform: NodeJS.Platform | string = process.platform
): string => (
  platform === "win32" ? "MiteiruLiveCaptionsBridge.exe" : "MiteiruLiveCaptionsBridge"
);

const uniquePaths = (candidates: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

export const getLiveCaptionsBridgeCandidates = ({
  platform = process.platform,
  resourcesPath = "",
  cwd = process.cwd(),
  appPath = ""
}: LiveCaptionsBridgeLookup = {}): string[] => {
  const name = getLiveCaptionsBridgeExecutableName(platform);
  const roots = uniquePaths([
    resourcesPath,
    cwd,
    appPath,
    appPath ? path.join(appPath, "..") : undefined
  ]);

  const relatives = [
    ["live-captions", name],
    ["resources", "live-captions", name],
    ["native", "live-captions", "mac", name],
    ["native", "live-captions", "bin", "Release", "net8.0-windows", "win-x64", "publish", name],
    ["native", "live-captions", "bin", "Debug", "net8.0-windows", "win-x64", "publish", name],
    ["native", "live-captions", "bin", "Release", "net8.0-windows", name],
    ["native", "live-captions", "bin", "Debug", "net8.0-windows", name]
  ];

  return uniquePaths(roots.flatMap((root) => (
    relatives.map((segments) => path.join(root, ...segments))
  )));
};

const tokenizerLanguageCodes: Record<string, string> = {
  kuromoji: "ja",
  cantonese: "yue",
  jieba: "zh-CN",
  vietnamese: "vi"
};

/** Apple Speech / Live Captions locale IDs (underscores), keyed by Miteiru languageCode. */
const appleLocalesByLanguageCode: Record<string, string> = {
  ja: "ja_JP",
  yue: "yue_CN",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
  "zh-HK": "zh_HK"
};

export type LiveCaptionsLocaleResult = {
  locale?: string;
  languageCode?: string;
  error?: string;
};

export const getLiveCaptionsAppleLocale = (tokenizerMode: string): LiveCaptionsLocaleResult => {
  const mode = tokenizerMode.trim();
  if (!mode) {
    return {error: "Load a language on the home screen first, then start Live CC."};
  }

  const languageCode = tokenizerLanguageCodes[mode];
  if (!languageCode) {
    return {error: `Live Captions has no language mapping for tokenizer "${mode}".`};
  }

  const locale = appleLocalesByLanguageCode[languageCode];
  if (!locale) {
    return {
      languageCode,
      error: `Apple Live Captions does not support ${languageCode}. Use Japanese, Mandarin, or Cantonese.`
    };
  }

  return {locale, languageCode};
};

