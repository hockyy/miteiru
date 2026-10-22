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

export interface SubtitleCandidate {
  type: "embedded" | "youtube";
  index: number;
  language?: string;
}

// ffprobe's ISO 639-2 tags, spelled the way YouTube does.
const ISO_639_2_TO_YOUTUBE: Record<string, string> = {
  chi: "zh", zho: "zh", cmn: "zh", jpn: "ja", eng: "en", vie: "vi"
};

// Subtitle languages that suit a learning language, best group first (`x-*` takes any region).
// A learning language not listed here accepts its own base language, so ja and vi need no entry.
const SUBTITLE_LANGUAGE_PREFERENCES: Record<string, string[][]> = {
  "zh-cn": [["zh-hans", "zh-cn", "zh-sg"], ["zh"], ["zh-hant", "zh-tw", "zh-hk"], ["zh-*"]],
  yue: [["yue"], ["zh-hk"], ["zh-hant", "zh-tw"], ["zh"]]
};

const baseLanguage = (code: string) => code.split("-")[0];

const normalizeSubtitleLanguage = (language: string) => {
  const [base, ...region] = language.toLowerCase().replace(/-orig$/, "").split("-");
  return [ISO_639_2_TO_YOUTUBE[base] ?? base, ...region].join("-");
};

// 0 is the best match, -1 means the language does not suit appLang at all.
const subtitleLanguageRank = (language: string, appLang: string) => {
  const appCode = appLang.toLowerCase();
  const groups = SUBTITLE_LANGUAGE_PREFERENCES[appCode] ?? [[baseLanguage(appCode), `${baseLanguage(appCode)}-*`]];
  return groups.findIndex((group) => group.some((pattern) => (
    pattern.endsWith("*") ? language.startsWith(pattern.slice(0, -1)) : language === pattern
  )));
};

/**
 * The tracks to preselect: primary is the best match for the language being learned, secondary is the
 * first English one. Ties go to the earlier candidate, so pass embedded tracks first, then YouTube manual
 * captions, then auto ones. Nothing goes underneath when English itself is being learned, or when no
 * track matches the language being learned.
 */
export const pickDefaultSubtitleTracks = (
  candidates: SubtitleCandidate[],
  appLang: string
): { primary: SubtitleCandidate | null; secondary: SubtitleCandidate | null } => {
  const ranked = candidates.flatMap((candidate) => {
    if (!candidate.language) return [];
    const language = normalizeSubtitleLanguage(candidate.language);
    return [{candidate, language, rank: subtitleLanguageRank(language, appLang)}];
  });

  let primary: (typeof ranked)[number] | null = null;
  for (const entry of ranked) {
    if (entry.rank >= 0 && (!primary || entry.rank < primary.rank)) primary = entry;
  }

  // English underneath only makes sense with something to learn on top of it.
  const secondary = !primary || baseLanguage(appLang.toLowerCase()) === "en"
    ? undefined
    : ranked.find((entry) => entry !== primary && baseLanguage(entry.language) === "en");

  return {primary: primary?.candidate ?? null, secondary: secondary?.candidate ?? null};
};
