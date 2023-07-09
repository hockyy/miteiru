import {useCallback, useEffect, useState} from 'react';
import {SubtitleContainer} from "../components/DataStructures";
import {randomUUID} from "crypto";
import {TOAST_TIMEOUT} from "../components/Toast";
import {isSubtitle, isVideo} from "../utils/formatUtils";
import {findNextInFolder} from "../utils/folderUtils";

const useLoadFiles = (setToastInfo, primarySub, setPrimarySub, secondarySub, setSecondarySub, mecab) => {
  const [videoSrc, setVideoSrc] = useState({src: '', type: '', path: ''});
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer('', mecab));
  }, [mecab]);

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
      SubtitleContainer.create(draggedSubtitle.src, mecab).then(tmpSub => {
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
      });
    } else if (isVideo(currentPath)) {
      const draggedVideo = {
        type: 'video/webm',
        src: `miteiru://${pathUri}`,
        path: pathUri
      };
      setVideoSrc(draggedVideo);
      resetSub(setPrimarySub)
      resetSub(setSecondarySub)
    }
  }, [mecab]);

  const onVideoEndHandler = useCallback(async () => {
    try {
      if (videoSrc.path) {
        const nextVideo = findNextInFolder(videoSrc.path);
        await onLoadFiles([{path: nextVideo}]);
      }

      if (primarySub.path) {
        const nextPrimary = findNextInFolder(primarySub.path);
        await onLoadFiles([{path: nextPrimary}]);
      }

      if (secondarySub.path) {
        const nextSecondary = findNextInFolder(secondarySub.path);
        await onLoadFiles([{path: nextSecondary}]);
      }
    } catch (error) {
      console.error(error);
    }
  }, [videoSrc.path, primarySub.path, secondarySub.path]);


  return {
    onLoadFiles,
    videoSrc,
    onVideoEndHandler
  }
};

export default useLoadFiles;
