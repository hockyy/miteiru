import {useCallback, useState} from "react";

const useReadyPlayerCallback = () => {
  const [player, setPlayer] = useState(null)

  const [currentTime, setCurrentTime] = useState(0);
  const [metadata, setMetadata] = useState(0);
  const readyCallback = useCallback((playerRef) => {
    setPlayer(playerRef);
    playerRef.on('loadedmetadata', () => {
      setMetadata(old => (old + 1));
    })
  }, []);
  return {metadata, readyCallback, player, setPlayer, currentTime, setCurrentTime};
}

export default useReadyPlayerCallback;