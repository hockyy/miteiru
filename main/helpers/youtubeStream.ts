/**
 * YouTube through mpv: yt-dlp finds a video's streams, and mpv plays them like a local file.
 * renderer/components/VideoPlayer/YouTubeVideo.tsx falls back to the YouTube embed when this fails.
 */

/**
 * What yt-dlp picks: the best video up to 1080p plus the best audio, or one file with both.
 * - `res` is the smaller side, so a vertical 1080x1920 video (a Short) still counts as 1080p;
 *   a filter on height would drop it to 480p.
 * - H.264 first: every platform decodes it in hardware, Apple's M1/M2 included, where AV1
 *   would run on the CPU.
 * - A video with no format at all (a premiere not live yet) still describes itself, so its
 *   captions and title load; it just has no stream for mpv.
 */
export const YOUTUBE_STREAM_FORMAT_ARGS = ["-f", "bv*+ba/b", "-S", "res:1080,vcodec:h264", "--ignore-no-formats-error"];

export interface YoutubeStreamSource {
  /** One URL for mpv: an EDL that plays the video and audio streams together. */
  url: string;
  /** The headers yt-dlp says the stream URLs need (User-Agent and others). */
  headers: Record<string, string>;
  title: string;
  isLive: boolean;
}

interface YtDlpFormat {
  url?: string;
  http_headers?: Record<string, string>;
}

interface YtDlpInfo extends YtDlpFormat {
  title?: string;
  is_live?: boolean;
  requested_formats?: YtDlpFormat[];
}

// mpv's EDL takes a URL as %<length in bytes>%<url>, so nothing in it needs escaping.
const edlEscape = (url: string) => `%${Buffer.byteLength(url, "utf8")}%${url}`;

/**
 * An mpv EDL that plays each stream as its own track, as mpv's own ytdl hook does: `!new_stream`
 * starts a track, `!no_clip` and `!no_chapters` keep each stream whole.
 */
export const edlForStreams = (urls: string[]) =>
  `edl://${urls.map((url) => `!no_clip;!no_chapters;${edlEscape(url)}`).join(";!new_stream;")}`;

/** The source mpv plays for yt-dlp's `-J` output (made with YOUTUBE_STREAM_FORMAT_ARGS). */
export const youtubeStreamSource = (info: YtDlpInfo): YoutubeStreamSource => {
  const formats = info.requested_formats?.length ? info.requested_formats : [info];
  const urls = formats.map((format) => format.url);
  if (urls.length === 0 || urls.some((url) => typeof url !== "string" || !/^https?:\/\//.test(url))) {
    throw new Error("yt-dlp found no playable stream for this video.");
  }
  return {
    url: edlForStreams(urls),
    headers: {...(formats[0].http_headers ?? {})},
    title: info.title ?? "",
    isLive: Boolean(info.is_live)
  };
};
