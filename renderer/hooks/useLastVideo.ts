import {useEffect, useState} from "react";
import {loadLastVideo, type LastVideo} from "../utils/continueWatching";

/** The last video watched, if it can still be opened (its file exists, or it is a YouTube link). */
export const useLastVideo = () => {
  const [last, setLast] = useState<LastVideo | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadLastVideo(window.electronStore, (path) => window.electronAPI.checkFile(path)).then((video) => {
      if (cancelled) return;
      setLast(video);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return {last, loaded};
};

export default useLastVideo;
