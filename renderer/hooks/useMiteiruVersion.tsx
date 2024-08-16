import { useEffect, useState } from "react";

const useMiteiruVersion = () => {
  const [miteiruVersion, setMiteiruVersion] = useState('')

  useEffect(() => {
    // Use the exposed ipc object from the window
    window.ipc.invoke('getAppVersion').then((version) => {
      setMiteiruVersion(version as string);
    });
  }, []);

  return { miteiruVersion }
}

export default useMiteiruVersion;