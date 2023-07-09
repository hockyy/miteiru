import {useCallback, useEffect, useState} from "react";
import {Simulate} from "react-dom/test-utils";
import play = Simulate.play;

const useReadyPlayerCallback = (onVideoEndHandler, blockEnder, setBlockEnder) => {
  const [player, setPlayer] = useState(null)

  const [currentTime, setCurrentTime] = useState(0);
  const [metadata, setMetadata] = useState(0);
  const readyCallback = useCallback((playerRef) => {
    setPlayer(playerRef);
    playerRef.on('loadedmetadata', () => {
      setMetadata(old => (old + 1))
    })
  }, []);

  useEffect(() => {
    if (player) {

    }
  }, [player, onVideoEndHandler, blockEnder, setBlockEnder]);
  return {metadata, readyCallback, player, setPlayer, currentTime, setCurrentTime};
}

export default useReadyPlayerCallback;