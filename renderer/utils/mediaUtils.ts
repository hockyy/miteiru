import {MediaTrack} from "../types/media";
import {getLanguageDisplayName as getManifestLanguageDisplayName} from "../languages/manifest";
import {isLocalPath, isYoutube} from "./utils";

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

export const getEmbeddedSubtitleTarget = (filePath: string): SubtitleTarget => (
  filePath.includes("secondary") || filePath.includes("_sec_") ? "secondary" : "primary"
);

export const getFileNameFromPath = (filePath: string) => (
  filePath.split("/").pop() || filePath.split("\\").pop() || "Unknown file"
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
