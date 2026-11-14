import {YOUTUBE_ID_PATTERN} from "../../renderer/utils/utils";

export type SearchDuration = "any" | "short" | "medium" | "long";

export interface SearchFilterOptions {
  duration?: SearchDuration;
  /** Only videos whose uploader wrote captions. */
  uploaderCaptions?: boolean;
}

export interface SearchEntry {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  views: number | null;
  description: string;
}

// The values of the duration filter: under 4 minutes, 4 to 20 minutes, over 20 minutes.
const DURATION_CODES: Record<Exclude<SearchDuration, "any">, number> = {short: 1, long: 2, medium: 3};

/**
 * YouTube's search filter (`sp`): base64 of a protobuf. Field 2 holds the filters: type (field 2) = 1
 * for videos only, duration (field 3), and subtitles (field 5) = 1 for uploader captions.
 */
export const youtubeSearchFilter = ({duration = "any", uploaderCaptions = false}: SearchFilterOptions = {}): string => {
  const filters = [0x10, 0x01];
  if (duration !== "any") filters.push(0x18, DURATION_CODES[duration]);
  if (uploaderCaptions) filters.push(0x28, 0x01);
  // btoa over the bytes: the worker's Buffer is a shim.
  return btoa(String.fromCharCode(0x12, filters.length, ...filters));
};

export const youtubeSearchUrl = (query: string, options: SearchFilterOptions = {}): string => (
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${encodeURIComponent(youtubeSearchFilter(options))}`
);

const DESCRIPTION_LENGTH = 200;

const text = (value: unknown) => (typeof value === "string" ? value : "");

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** yt-dlp's `--flat-playlist -J` listing of a search, as the videos worth showing. */
export const parseYoutubeSearch = (json: any): SearchEntry[] => {
  const entries: unknown[] = Array.isArray(json?.entries) ? json.entries : [];
  const seen = new Set<string>();
  const videos: SearchEntry[] = [];
  for (const entry of entries as any[]) {
    const id = entry?.id;
    if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id) || seen.has(id)) continue;
    // A stream that is running or has not started has no captions to read yet.
    if (entry.live_status === "is_live" || entry.live_status === "is_upcoming") continue;
    seen.add(id);
    videos.push({
      id,
      title: text(entry.title),
      channel: text(entry.channel) || text(entry.uploader),
      durationSeconds: numberOrNull(entry.duration),
      views: numberOrNull(entry.view_count),
      description: Array.from(text(entry.description).replace(/\s+/g, " ").trim()).slice(0, DESCRIPTION_LENGTH).join("")
    });
  }
  return videos;
};
