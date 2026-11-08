import type {CSSProperties} from "react";
import {videoConstants} from "./constants";

export const isArrayEndsWithMatcher = (path, arrayMatcher) => {
  const lowerPath = path.toLowerCase();
  for (const videoFormat of arrayMatcher) {
    if (lowerPath.endsWith('.' + videoFormat)) {
      return true
    }
  }
  return false;
}

export const isVideo = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedVideoFormats);
}
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video ID in a YouTube link, or null. One parser for every place that asks, so they agree:
 * watch?v= (with v anywhere in the query), youtu.be/, and the /live/, /shorts/, /embed/ and /v/ paths,
 * on youtube.com, www., m., music. and youtube-nocookie.com, with or without https://.
 * Other parameters (si, t, list, feature, app) are ignored; channel and playlist-only links give null.
 */
export const parseYoutubeVideoId = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (host === 'youtu.be') {
    id = segments[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === 'watch') id = url.searchParams.get('v');
    else if (['live', 'shorts', 'embed', 'v'].includes(segments[0])) id = segments[1];
  }
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
};

/** A YouTube video link; a channel, a playlist alone or another site's link is not one. */
export const isYoutube = (url) => parseYoutubeVideoId(url) !== null;

export const isDomainUri = (url) => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isLocalPath = (url) => {

  // If it's not a valid URL, it might be a local path
  return !isDomainUri(url);
}


export const isSubtitle = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedSubtitleFormats);
}

export const extractVideoId = (url) => parseYoutubeVideoId(url);

// " - <file name>" for the window title; Windows paths use backslashes.
const getFormattedNameFromPath = (path) => path ? ` - ${path.split(/[\\/]/).pop()}` : '';

export const getMiteiruAppName = () =>
  process.env.NODE_ENV === 'development' ? 'Miteiru (dev)' : 'Miteiru';

/** `videoName`, when given, names the video instead of its path (a YouTube video's title). */
export const getMiteiruVideoTitle = (videoPath = '', primarySub = '', secondarySub = '', videoName?: string) => {
  const videoPart = videoName ? ` - ${videoName}` : getFormattedNameFromPath(videoPath);
  return `${getMiteiruAppName()}${videoPart}${getFormattedNameFromPath(primarySub)}${getFormattedNameFromPath(secondarySub)}`;
}

export const toTime = (time: number) => {
  time = Math.max(0, Math.trunc(time))
  const seconds = time % 60;
  time -= seconds;
  time /= 60;
  const minutes = time % 60;
  time -= minutes;
  time /= 60;
  const hours = time;

  return `${hours > 0 ? (hours + ':') : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const joinString = (arr, separator = '; ') => {
  let total = "";
  arr.forEach(val => {
    if (total !== '') total += separator
    total += val.toString();
  })
  return total;
}

/** Style for a `.slider` range input: `--fill` is how far along its track the value is. */
export const rangeFillStyle = (value: number, min: number, max: number): CSSProperties => {
  const fraction = max > min ? (value - min) / (max - min) : 0;
  return {"--fill": `${Math.min(100, Math.max(0, fraction * 100))}%`} as CSSProperties;
};

export const adjustTimeWithShift = (currentTime: number, shift: number) => {
  return Math.trunc(currentTime * 1000) - shift
}


export const sortAndFilterTopXPercentToJson = (frequency, x: number) => {
  const sortedArray = Array.from(frequency.entries())
  .sort((a, b) => b[1] - a[1]);

  const limitIndex = Math.ceil((x / 100) * sortedArray.length);
  const topXPercentArray = sortedArray.slice(0, limitIndex);

  const filteredArray = topXPercentArray.filter(entry => entry[1] > 1);

  return filteredArray.reduce((obj, [key, value]) => {
    obj[key] = value;
    return obj;
  }, {});
}
export const getRelativeTime = (timestamp: number, now: number = Date.now()): string => {
  const updatedDate = new Date(timestamp).getTime();
  const diffTime = updatedDate - now;
  const absDiffTime = Math.abs(diffTime);
  const diffDays = Math.floor(absDiffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(absDiffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(absDiffTime / (1000 * 60));

  const isPast = diffTime < 0;
  const suffix = isPast ? 'ago' : 'from now';

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ${suffix}`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ${suffix}`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ${suffix}`;
  } else {
    return isPast ? 'Just now' : 'In a moment';
  }
};

export const getColorGradient = (timestamp) => {
  const now = new Date().getTime();
  const diff = now - timestamp;
  const maxDiff = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  const ratio = Math.min(Math.max(diff / maxDiff, 0), 1);

  // Pastel green (newest) to pastel red (oldest)
  const red = Math.round(255 * (0.5 + ratio * 0.5));
  const green = Math.round(255 * (1 - ratio * 0.5));
  const blue = Math.round(255 * (0.5 + Math.abs(ratio - 0.5) * 0.5));

  return `rgb(${red}, ${green}, ${blue})`;
};

export enum SubtitleMode {
  Normal,
  Karaoke
}