import {useEffect, useState} from "react";
import {ipcRenderer} from "electron";

const usePauseAndRepeat = (primarySub,
                           player,
                           currentTime,) => {
  const [pauseId, setPauseId] = useState<number>(-1);
  useEffect(() => {

  }, [currentTime]);
}

export default usePauseAndRepeat;