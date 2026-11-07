import {useEffect, useState} from 'react';
import {extractVideoId, isYoutube} from '../utils/utils';

/**
 * A YouTube link's video title (from yt-dlp, whose run the player and the subtitle list share), or
 * null for anything else, until it is known, or without yt-dlp.
 */
export const useYoutubeTitle = (url: string): string | null => {
  const [found, setFound] = useState<{ url: string; title: string | null }>({url: '', title: null});
  useEffect(() => {
    const videoId = url && isYoutube(url) ? extractVideoId(url) : null;
    if (!videoId) return;
    let cancelled = false;
    Promise.resolve(window.electronAPI?.getYoutubeVideoTitle?.(videoId))
        .then((title) => {
          if (!cancelled) setFound({url, title: typeof title === 'string' && title.trim() ? title.trim() : null});
        })
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  return found.url === url ? found.title : null;
};
