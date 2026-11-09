import {isLocalPath, isYoutube, toTime} from "./utils";
import {getFileNameFromPath, isMiteiruTempSubtitle} from "./mediaUtils";

/** Where the last video is kept in the settings store. */
export const LAST_VIDEO_KEY = 'video.last';

/** Positions this close to the end count as finished: continuing starts again from the top. */
const FINISHED_WITHIN_SECONDS = 10;
/** Positions before this are not worth naming ("Continue ep01.mkv at 0:02"). */
const WORTH_NAMING_SECONDS = 5;

export type LastVideo = {
  /** A file path or a YouTube link. */
  path: string;
  title: string;
  /** Seconds. */
  position: number;
  subtitles: { primary?: string; secondary?: string };
  savedAt: number;
};

/** The two store calls this module needs (window.miteiruStore). */
export type VideoStore = {
  get: (key: string, defaultValue?: unknown) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

/** Windows pathUris carry a leading slash ("/C:/Videos/ep01.mkv"); the file itself has none. */
export const filePathOf = (path: string): string => path.replace(/^\/([A-Za-z]:)/, '$1');

/** A user's own subtitle file worth reopening, or undefined (extracted tracks and YouTube captions are temporary). */
const reopenableSubtitle = (path: string | undefined): string | undefined => (
  path && !isMiteiruTempSubtitle(path) ? filePathOf(path) : undefined
);

export type LastVideoInput = {
  path: string;
  title?: string;
  /** Seconds. */
  position: number;
  /** Seconds, 0 when unknown. */
  duration?: number;
  primarySubtitle?: string;
  secondarySubtitle?: string;
  now?: number;
};

/** What to save for the video playing now, or null when there is none. */
export const buildLastVideo = (input: LastVideoInput): LastVideo | null => {
  if (!input.path) return null;
  const youtube = isYoutube(input.path);
  const path = youtube ? input.path : filePathOf(input.path);
  const finished = (input.duration ?? 0) > 0 && input.position > (input.duration as number) - FINISHED_WITHIN_SECONDS;
  const position = finished || !Number.isFinite(input.position) ? 0 : Math.max(0, Math.floor(input.position));
  return {
    path,
    title: input.title || (youtube ? 'YouTube video' : getFileNameFromPath(path)),
    position,
    subtitles: {
      primary: reopenableSubtitle(input.primarySubtitle),
      secondary: reopenableSubtitle(input.secondarySubtitle)
    },
    savedAt: input.now ?? Date.now()
  };
};

export const saveLastVideo = async (store: VideoStore, video: LastVideo | null): Promise<void> => {
  if (!video) return;
  await store.set(LAST_VIDEO_KEY, video);
};

const isStoredVideo = (value: unknown): value is LastVideo => {
  const video = value as LastVideo | null;
  return Boolean(video) && typeof video === 'object' && typeof video.path === 'string' && video.path !== '' &&
    typeof video.position === 'number';
};

/**
 * The saved last video, or null when there is none or its file is gone. A YouTube link needs no
 * file; a subtitle file that has gone is left out, the video still continues.
 */
export const loadLastVideo = async (
  store: VideoStore,
  fileExists: (path: string) => Promise<boolean>
): Promise<LastVideo | null> => {
  let stored: unknown;
  try {
    stored = await store.get(LAST_VIDEO_KEY, null);
  } catch {
    return null;
  }
  if (!isStoredVideo(stored)) return null;
  if (!isYoutube(stored.path) && (!isLocalPath(stored.path) || !(await fileExists(stored.path).catch(() => false)))) {
    return null;
  }
  const keep = async (path: string | undefined) => (path && await fileExists(path).catch(() => false) ? path : undefined);
  return {
    ...stored,
    title: stored.title || getFileNameFromPath(stored.path),
    subtitles: {
      primary: await keep(stored.subtitles?.primary),
      secondary: await keep(stored.subtitles?.secondary)
    }
  };
};

/** "Continue ep01.mkv at 12:34", or without the time near the start. */
export const continueLabel = (video: Pick<LastVideo, 'title' | 'position'>): string => (
  video.position >= WORTH_NAMING_SECONDS
    ? `Continue ${video.title} at ${toTime(video.position)}`
    : `Continue ${video.title}`
);
