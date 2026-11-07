import type {MediaTrack} from "../types/media";
import {getLanguageDisplayName as getManifestLanguageDisplayName} from "../languages/manifest";
import {isLocalPath, isSubtitle, isVideo, isYoutube} from "./utils";
import {NORMALIZED_SUBTITLE_PREFIX} from "./constants";
import {playbackMimeForPath} from "./mediaMime";
import {type RoutedSubtitle, routeSubtitlesBesideVideo} from "./subtitleTags";

export type SubtitleTarget = "primary" | "secondary";

/** A web link of any site in a dragged link, for telling the learner that only YouTube opens. */
export const droppedWebLink = (data: Pick<DataTransfer, "getData">): string | undefined => (
  [data.getData("text/uri-list"), data.getData("text/plain")]
    .flatMap((text) => text.split(/\r?\n/).map((line) => line.trim()))
    .find((line) => !line.startsWith("#") && looksLikeWebLink(line))
);

/** Safari and Chrome may provide dragged links as URI lists, plain text, or both. */
export const droppedYoutubeUrl = (data: Pick<DataTransfer, "getData">): string | undefined => (
  [data.getData("text/uri-list"), data.getData("text/plain")]
    .flatMap((text) => text.split(/\r?\n/).map((line) => line.trim()))
    .find((line) => !line.startsWith("#") && isYoutube(line))
);

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

/** A YouTube URL plays in the embedded YouTube player; anything else is a file mpv opens by path. */
export const buildVideoSource = (currentPath: string, pathUri: string) => isYoutube(currentPath) ? {
  type: "video/youtube",
  src: currentPath,
  path: currentPath
} : {
  type: playbackMimeForPath(pathUri),
  src: pathUri,
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
 * With `appLang`, subtitles beside the video are routed by the language in their name (show.ja.srt is
 * the main subtitle, show.en.srt the translation, other languages are left out); without it, they all load
 * and the learner is asked where each goes.
 */
export const loadMediaPaths = async (
  paths: string[],
  loadFile: (files: { path: string; target?: SubtitleTarget }[]) => unknown,
  appLang?: string
) => {
  // A video dropped with, say, its .nfo file just ignores the .nfo; a drop of nothing usable still reaches
  // the loader, which says why it can't open it.
  const usable = paths.filter((filePath) => isVideo(filePath) || isSubtitle(filePath));
  paths = usable.length > 0 ? usable : paths;
  const video = paths.find((filePath) => isVideo(filePath));
  const besideVideo = video ? await window.electronAPI.checkSubtitleFile(video) : [];
  const routed: RoutedSubtitle[] = !video ? [] : appLang
    ? routeSubtitlesBesideVideo(video, besideVideo, appLang)
    : besideVideo.map((path) => ({path}));
  const ordered: RoutedSubtitle[] = video
    ? [{path: video}, ...paths.filter((filePath) => !isVideo(filePath)).map((path) => ({path})), ...routed]
    : paths.map((path) => ({path}));
  const seen = new Set<string>();
  for (const {path, target} of ordered) {
    const key = samePathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    loadFile([target ? {path, target} : {path}]);
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
  /** Can't be used (picture subtitles): never preselected. */
  unusable?: boolean;
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

export const normalizeSubtitleLanguage = (language: string) => {
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
    if (!candidate.language || candidate.unusable) return [];
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

/**
 * The audio track to preselect: the one in the language being learned (the best match when several),
 * otherwise the file's default track, otherwise the first. An index into `tracks`.
 */
export const pickDefaultAudioTrack = (
  tracks: Pick<MediaTrack, "language" | "default">[],
  appLang: string
): number => {
  let best = -1;
  let bestRank = Infinity;
  tracks.forEach((track, index) => {
    if (!track.language) return;
    const rank = subtitleLanguageRank(normalizeSubtitleLanguage(track.language), appLang);
    if (rank >= 0 && rank < bestRank) {
      best = index;
      bestRank = rank;
    }
  });
  if (best >= 0) return best;
  const fallback = tracks.findIndex((track) => track.default);
  return fallback >= 0 ? fallback : 0;
};

const listFormats = (formats: string[]) => formats.join(", ");

// The few formats worth naming when a file is refused; the full lists are longer.
const EXAMPLE_VIDEO_FORMATS = ["mp4", "mkv", "webm"];
const EXAMPLE_SUBTITLE_FORMATS = ["srt", "ass", "vtt", "lrc"];

/** What to tell the learner when a dropped or picked file is neither a video nor a subtitle. */
export const unsupportedFileMessage = (filePath: string): string => {
  const name = getFileNameFromPath(filePath);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot).toLowerCase() : "";
  const what = extension ? `"${extension}" files` : `"${name}"`;
  return `Miteiru can't open ${what}. Videos: ${listFormats(EXAMPLE_VIDEO_FORMATS)}…; subtitles: ${listFormats(EXAMPLE_SUBTITLE_FORMATS)}.`;
};

export const NOT_YOUTUBE_LINK_MESSAGE = "Only YouTube links open directly. For other sites, download the video first.";

/** Whether pasted text looks like a web link (so it deserves the message above), not just words. */
export const looksLikeWebLink = (text: string): boolean => /^https?:\/\/\S+$/i.test(text.trim());
