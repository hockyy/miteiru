import {useCallback, useState} from 'react';
import {SubtitleContainer} from "../components/DataStructures";
import {randomUUID} from "crypto";
import {TOAST_TIMEOUT} from "../components/Toast";
import {isSubtitle, isVideo} from "../utils/fomatUtils";

const useLoadFiles = (setToastInfo, setPrimarySub, setSecondarySub, resetSub, mecab) => {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''});
  const onLoadFiles = useCallback(async acceptedFiles => {
    let currentPath = acceptedFiles[0].path;
    currentPath = currentPath.replaceAll('\\', '/')
    let pathUri = currentPath;
    if (process.platform === 'win32') {
      pathUri = '/' + currentPath;
    }
    if (isSubtitle(currentPath)) {
      setToastInfo({
        message: 'Loading subtitle, please wait!',
        update: randomUUID()
      });
      const toastSetter = setInterval(() => {
        setToastInfo({
          message: 'Still loading subtitle, please wait!',
          update: randomUUID()
        });
      }, TOAST_TIMEOUT);
      const draggedSubtitle = {
        type: 'text/plain',
        src: `${currentPath}`
      };
      const tmpSub = await SubtitleContainer.create(draggedSubtitle.src, mecab);
      clearInterval(toastSetter);
      if (tmpSub.language === "JP") {
        setPrimarySub(tmpSub);
      } else {
        setSecondarySub(tmpSub);
      }
      setToastInfo({
        message: 'Subtitle loaded',
        update: randomUUID()
      });
    } else if (isVideo(currentPath)) {
      const draggedVideo = {
        type: 'video/webm',
        src: `miteiru://${pathUri}`
      };
      setVideoSrc(draggedVideo);

      resetSub(setPrimarySub)
      resetSub(setSecondarySub)
    }
  }, [mecab]);
  const onVideoEndHandler = () => {};
  return {
    onLoadFiles,
    videoSrc,
    onVideoEndHandler
  }
};

export default useLoadFiles;
