import {useCallback, useState} from 'react';
import {SubtitleContainer} from "../components/DataStructures";
import {randomUUID} from "crypto";
import {TOAST_TIMEOUT} from "../components/Toast";
import {isSubtitle, isVideo} from "../utils/utils";
import {findNextInFolder} from "../utils/folderUtils";
import {useAsyncAwaitQueue} from "./useAsyncAwaitQueue";

const useLoadFiles = (setToastInfo, primarySub, setPrimarySub, secondarySub, setSecondarySub, mecab) => {
  const [videoSrc, setVideoSrc] = useState({src: '', type: '', path: ''});
  const queue = useAsyncAwaitQueue();
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer('', mecab));
  }, [mecab]);
  const onLoadFiles = useCallback(async acceptedFiles => {
    const currentHash = Symbol();
    await queue.wait(currentHash);
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
    await queue.end(currentHash);
  }, [mecab]);
  const [blockEnder, setBlockEnder] = useState(false);
  const onVideoEndHandler = useCallback(async () => {
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
  }, [videoSrc.path, primarySub.path, secondarySub.path]);


  return {
    onLoadFiles,
    videoSrc,
    onVideoEndHandler,
    setBlockEnder,
    blockEnder
  }
};

export default useLoadFiles;
