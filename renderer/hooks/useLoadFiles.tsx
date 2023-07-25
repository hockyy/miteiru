import {useCallback, useEffect, useState} from 'react';
import {setGlobalSubtitleId, SubtitleContainer} from "../components/DataStructures";
import {randomUUID} from "crypto";
import {TOAST_TIMEOUT} from "../components/Toast";
import {extractVideoId, isLocalPath, isSubtitle, isVideo, isYoutube} from "../utils/utils";
import {findPositionDeltaInFolder} from "../utils/folderUtils";
import {useAsyncAwaitQueue} from "./useAsyncAwaitQueue";
import {ipcRenderer} from 'electron';

const useLoadFiles = (setToastInfo, primarySub, setPrimarySub, secondarySub, setSecondarySub, tokenizeMiteiru, setEnableSeeker, changeTimeTo, player) => {
  const [videoSrc, setVideoSrc] = useState({src: '', type: '', path: ''});
  const queue = useAsyncAwaitQueue();
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer(''));
  }, [tokenizeMiteiru]);
  const onLoadFiles = useCallback(async acceptedFiles => {
    const currentHash = Symbol();
    await queue.wait(currentHash);
    let currentPath = acceptedFiles[0].path;
    let pathUri;
    if (isLocalPath(currentPath)) {
      currentPath = currentPath.replaceAll('\\', '/')
      pathUri = currentPath;
      if (process.platform === 'win32') {
        pathUri = '/' + currentPath;
      }
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
      SubtitleContainer.create(draggedSubtitle.src).then(tmpSub => {
        clearInterval(toastSetter);
        if (tmpSub.language === "JP") {
          setPrimarySub(tmpSub);
          setGlobalSubtitleId(tmpSub.id);
        } else {
          setSecondarySub(tmpSub);
        }
        setToastInfo({
          message: 'Subtitle loaded',
          update: randomUUID()
        });
        if (tmpSub.language === "JP") {
          const toastSetter = setInterval(() => {
            setToastInfo({
              message: `JP cache: ${tmpSub.progress}`,
              update: randomUUID()
            });
          }, TOAST_TIMEOUT / 10);
          tmpSub.adjustJapanese(tokenizeMiteiru).then(() => {
            clearInterval(toastSetter);
          })
        }
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
    } else if (isYoutube(currentPath)) {
      const draggedVideo = {
        type: 'video/youtube',
        src: currentPath + '?cc_load_policy=0',
        path: currentPath
      };
      setVideoSrc(draggedVideo);
      ipcRenderer.invoke("getYoutubeSubtitle", extractVideoId(currentPath)).then(r => {
        console.log(r)
      })
      resetSub(setPrimarySub)
      resetSub(setSecondarySub)

    }
    await queue.end(currentHash);
  }, [tokenizeMiteiru]);
  const onVideoChangeHandler = useCallback(async (delta: number = 1) => {
    if (!isLocalPath(videoSrc.path)) return;
    if (videoSrc.path) {
      const nextVideo = findPositionDeltaInFolder(videoSrc.path, delta);
      if (nextVideo !== '') {
        await onLoadFiles([{path: nextVideo}]);
      } else {
        setEnableSeeker(true);
      }
    }
    if (primarySub.path) {
      const nextPrimary = findPositionDeltaInFolder(primarySub.path, delta);
      if (nextPrimary !== '') {
        await onLoadFiles([{path: nextPrimary}]);
      }
    }
    if (secondarySub.path) {
      const nextSecondary = findPositionDeltaInFolder(secondarySub.path, delta);
      if (nextSecondary !== '') {
        await onLoadFiles([{path: nextSecondary}]);
      }
    }
  }, [videoSrc.path, primarySub.path, secondarySub.path]);

  useEffect(() => {
    if (player) {
      const enableSeeker = () => {
        setEnableSeeker(true);
        changeTimeTo(0);
      }
      player.on('loadedmetadata', enableSeeker)
      return () => {
        setEnableSeeker(true);
        player.off('loadedmetadata', enableSeeker)
      }
    }
  }, [player, videoSrc.path])

  return {
    onLoadFiles,
    videoSrc,
    onVideoChangeHandler
  }
};

export default useLoadFiles;
