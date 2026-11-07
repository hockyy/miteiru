import {useEffect, useMemo, useState} from 'react';
import {NativeVideo} from './NativeVideo';
import VideoJS from './VideoJS';
import {isTauri} from '../../utils/nativePlayer';
import {extractVideoId} from '../../utils/utils';
import type {PlaybackClock} from '../../utils/playbackClock';

type Stream = { url: string; headers: Record<string, string> };
type Mode =
  | { kind: 'resolving' }
  | { kind: 'native'; stream: Stream }
  /** `start`: where mpv had got to when it failed, so the embed carries on from there. */
  | { kind: 'embed'; start: number };

/** How long yt-dlp gets to find the streams before the embed plays the video instead. */
const RESOLVE_TIMEOUT_MS = 30_000;

/** The streams yt-dlp finds for a YouTube link (main/helpers/youtubeStream.ts), or null. */
const resolveStream = async (url: string): Promise<Stream | null> => {
  const videoId = extractVideoId(url);
  if (!videoId || !isTauri()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([window.backend.invoke('resolveYoutubeStream', videoId), timeout]) as
      { ok: boolean; url?: string; headers?: Record<string, string> } | null;
    return result?.ok && result.url ? {url: result.url, headers: result.headers ?? {}} : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * A YouTube video. In the desktop shell, yt-dlp finds its streams and mpv plays them like a local
 * file: hardware decoding, Miteiru's own subtitles, and none of the embed's limits (videos that
 * refuse embedding, YouTube's captions over Miteiru's). Without yt-dlp, or when it or the stream
 * fails, the YouTube embed plays the video instead.
 */
export const YouTubeVideo = ({options, onReady, clock}: { options: any; onReady: (player: any) => void; clock: PlaybackClock }) => {
  const url: string = options.sources[0].src;
  const [mode, setMode] = useState<Mode>({kind: 'resolving'});

  useEffect(() => {
    let cancelled = false;
    setMode({kind: 'resolving'});
    resolveStream(url).then((stream) => {
      if (!cancelled) setMode(stream ? {kind: 'native', stream} : {kind: 'embed', start: 0});
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const modeOptions = useMemo(() => {
    if (mode.kind === 'native') {
      return {...options, sources: [{...options.sources[0], path: mode.stream.url, httpHeaders: mode.stream.headers}]};
    }
    if (mode.kind === 'embed' && mode.start > 0) {
      return {...options, youtube: {...options.youtube, customVars: {...options.youtube?.customVars, start: mode.start}}};
    }
    return options;
  }, [mode, options]);

  if (mode.kind === 'resolving') {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center text-sm font-semibold text-white/70">
          Loading from YouTube…
        </div>
    );
  }
  if (mode.kind === 'native') {
    return (
        <NativeVideo options={modeOptions} onReady={onReady} clock={clock}
                     onError={() => setMode({kind: 'embed', start: Math.floor(clock.get())})}/>
    );
  }
  return <VideoJS options={modeOptions} onReady={onReady} clock={clock}/>;
};

export default YouTubeVideo;
