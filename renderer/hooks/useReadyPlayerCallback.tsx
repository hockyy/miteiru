import {useCallback, useState} from "react";
import {usePlaybackClockInstance} from "../utils/playbackClock";

const useReadyPlayerCallback = () => {
  const [player, setPlayer] = useState(null)

  // The player's time; components subscribe to it rather than re-rendering the page 33 times a second.
  const clock = usePlaybackClockInstance();
  const [metadata, setMetadata] = useState(0);
  // Called with null when the player is disposed.
  const readyCallback = useCallback((playerRef) => {
    setPlayer(playerRef);
    playerRef?.on('loadedmetadata', () => {
      setMetadata(old => (old + 1));
    })
  }, []);
  return {metadata, readyCallback, player, setPlayer, clock};
}

export default useReadyPlayerCallback;