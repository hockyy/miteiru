import {getYoutubeVideoId} from "./mediaUtils";
import {isYoutube} from "./utils";

export type LyricsPathApi = {
  getUserDataPath: () => Promise<string>;
  joinPath: (...pathSegments: string[]) => Promise<string>;
  checkFile: (filePath: string) => Promise<boolean>;
};

export const youtubeLyricsFileName = (videoId: string): string => `yt_${videoId}.lrc`;

export const legacyYoutubeLyricsFileName = (videoId: string): string => `${videoId}.lrc`;

export const youtubeLyricsCandidateNames = (videoId: string): string[] => [
  youtubeLyricsFileName(videoId),
  legacyYoutubeLyricsFileName(videoId)
];

export const lyricsQueryFromYoutubeTitle = (title: string): string => title
  .replace(/\s*[([【]\s*official(?:\s+music)?\s+video\s*[)\]】]/gi, "")
  .replace(/\s*[([【]\s*official\s+audio\s*[)\]】]/gi, "")
  .replace(/\s*[([【]\s*lyrics?\s*[)\]】]/gi, "")
  .replace(/\s*[([【]\s*mv\s*[)\]】]/gi, "")
  .replace(/\s{2,}/g, " ")
  .trim();

export const lyricsSearchQueryFromLocalPath = (videoPath: string): string => {
  const filename = videoPath.split("/").pop()?.split("\\").pop() ?? "";
  return filename
    .replace(/\.(mp4|mkv|avi|webm|mov)$/i, "")
    .replace(/(1080p|720p|480p|HD|FHD|4K)/gi, "")
    .replace(/[._-]/g, " ")
    .trim();
};

export const lyricsSearchQuery = ({
  videoPath,
  youtubeTitle
}: {
  videoPath?: string;
  youtubeTitle?: string | null;
}): string => {
  if (youtubeTitle?.trim()) {
    return lyricsQueryFromYoutubeTitle(youtubeTitle);
  }
  if (!videoPath) {
    return "";
  }
  if (isYoutube(videoPath)) {
    return "";
  }
  return lyricsSearchQueryFromLocalPath(videoPath);
};

export const findCachedYoutubeLyricsPath = async (
  videoPath: string,
  api: LyricsPathApi
): Promise<string | null> => {
  const videoId = getYoutubeVideoId(videoPath);
  if (!videoId) {
    return null;
  }

  const lyricsDir = await api.joinPath(await api.getUserDataPath(), "lyrics");
  for (const name of youtubeLyricsCandidateNames(videoId)) {
    const candidate = await api.joinPath(lyricsDir, name);
    if (await api.checkFile(candidate)) {
      return candidate;
    }
  }
  return null;
};
