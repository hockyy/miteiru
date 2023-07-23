import {useEffect, useState} from "react";
import {ipcRenderer} from "electron";

const useMiteiruVersion = () => {
  const [miteiruVersion, setMiteiruVersion] = useState('')
  useEffect(() => {
    ipcRenderer.invoke('getAppVersion').then((version) => {
      setMiteiruVersion(version);
    });
  }, []);
  return {miteiruVersion}
}

export default useMiteiruVersion;