import type {MediaTrack} from "../types/media";
import {getLanguageDisplayName as getManifestLanguageDisplayName} from "../languages/manifest";
import {isLocalPath, isVideo, isYoutube} from "./utils";
import {NORMALIZED_SUBTITLE_PREFIX} from "./constants";

export type SubtitleTarget = "primary" | "secondary";

export const normalizeDroppedPath = (rawPath: string) => {
  let currentPath = rawPath;
  let pathUri = rawPath;

  if (isLocalPath(currentPath)) {
    currentPath = currentPath.replaceAll("\\", "/");
    pathUri = currentPath;
    if (process.platform === "win32" && !pathUri.startsWith("/")) {
      pathUri = `/${currentPath}`;
    }
  }

  return {currentPath, pathUri};
};

export const buildVideoSource = (currentPath: string, pathUri: string) => isYoutube(currentPath) ? {
  type: "video/youtube",
  src: currentPath,
  path: currentPath
} : {
  type: "video/webm",
  src: `miteiru://${pathUri}`,
  path: pathUri
};

export const isEmbeddedSubtitlePath = (filePath: string) => (
  filePath.includes("miteiru_subtitle_") || filePath.includes("miteiru_youtube_")
);

/**
 * Whether a subtitle is a file Miteiru wrote to the temp folder (a track extracted from the video,
 * YouTube captions, a sentence-case copy) rather than one of the user's files.
 */
export const isMiteiruTempSubtitle = (filePath: string) => (
  isEmbeddedSubtitlePath(filePath) || getFileNameFromPath(filePath).startsWith(NORMALIZED_SUBTITLE_PREFIX)
);

/** Whether a subtitle's name marks it as English: `show.en.srt`, `show.eng.ass`, `show.english.vtt`. */
export const isEnglishSubtitleName = (filePath: string) => /\.(en|eng|english)(-[a-z]+)?\.[^.]+$/i.test(getFileNameFromPath(filePath));

/**
 * The slot a subtitle goes into without asking, if any: the one the caller names (the next episode keeps
 * its slot), the one an extracted track was made for, or secondary for an English-named file while
 * another language is being learned. Undefined means ask.
 */
export const knownSubtitleTarget = (
  filePath: string,
  appLang: string,
  englishLang: string,
  requested?: SubtitleTarget
): SubtitleTarget | undefined => {
  if (requested) return requested;
  if (isEmbeddedSubtitlePath(filePath)) return getEmbeddedSubtitleTarget(filePath);
  if (appLang !== englishLang && isEnglishSubtitleName(filePath)) return "secondary";
  return undefined;
};

// Windows paths name the same file in any case (the drop gives `EP01.SRT`, the lookup builds `EP01.srt`).
const samePathKey = (filePath: string) => (/^[a-z]:[\\/]|\\/i.test(filePath) ? filePath.toLowerCase() : filePath);

/**
 * Loads dropped or picked files one at a time: the first video, then the subtitles given with it, then
 * those beside it that share its name. Further videos are ignored, since only one plays.
 * `loadFile` takes one file per call (useLoadFiles' onLoadFiles).
 */
export const loadMediaPaths = async (paths: string[], loadFile: (files: { path: string }[]) => unknown) => {
  const video = paths.find((filePath) => isVideo(filePath));
  const besideVideo = video ? await window.electronAPI.checkSubtitleFile(video) : [];
  const ordered = video ? [video, ...paths.filter((filePath) => !isVideo(filePath)), ...besideVideo] : paths;
  const seen = new Set<string>();
  for (const filePath of ordered) {
    const key = samePathKey(filePath);
    if (seen.has(key)) continue;
    seen.add(key);
    loadFile([{path: filePath}]);
  }
};

export const getEmbeddedSubtitleTarget = (filePath: string): SubtitleTarget => (
  filePath.includes("secondary") || filePath.includes("_sec_") ? "secondary" : "primary"
);

export const getFileNameFromPath = (filePath: string) => (
  filePath.split(/[\\/]/).pop() || "Unknown file"
);

export const getYoutubeVideoId = (videoPath: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#/]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = videoPath.match(pattern);
    if (match) return match[1];
  }

  return null;
};

export const getLanguageDisplayName = (langCode: string) => {
  return getManifestLanguageDisplayName(langCode);
};

export const getLanguageEmoji = (lang: string) => {
  switch (lang?.toLowerCase()) {
    case "japanese":
    case "jpn":
    case "ja":
      return "🇯🇵";
    case "chinese":
    case "chi":
    case "zh-cn":
    case "zh":
      return "🇨🇳";
    case "cantonese":
    case "yue":
    case "zh-hk":
      return "🇭🇰";
    case "vietnamese":
    case "vi":
    case "vie":
      return "🇻🇳";
    case "english":
    case "eng":
    case "en":
      return "🇺🇸";
    default:
      return "🌐";
  }
};

export const getTrackLabel = (track: MediaTrack) => {
  const parts = [];
  if (track.title) parts.push(track.title);
  if (track.language) parts.push(`(${track.language.toUpperCase()})`);
  if (parts.length === 0) parts.push(`Track ${track.index + 1}`);
  if (track.default) parts.push("[Default]");
  return parts.join(" ");
};
