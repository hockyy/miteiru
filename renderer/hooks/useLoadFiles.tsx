import {useCallback, useEffect, useState} from 'react';
import {
  convertSubtitlesToEntries, Line,
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {randomUUID} from "crypto";
import {TOAST_TIMEOUT} from "../components/VideoPlayer/Toast";
import {extractVideoId, isLocalPath, isSubtitle, isVideo, isYoutube} from "../utils/utils";
import {findPositionDeltaInFolder} from "../utils/folderUtils";
import {useAsyncAwaitQueue} from "./useAsyncAwaitQueue";
import {ipcRenderer} from 'electron';
import {videoConstants} from "../utils/constants";
import video from "../pages/video";

const useLoadFiles = (setToastInfo, primarySub, setPrimarySub,
                      secondarySub, setSecondarySub,
                      primaryStyling,
                      tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang) => {
  const [videoSrc, setVideoSrc] = useState({src: '', type: '', path: ''});
  const queue = useAsyncAwaitQueue();
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer(''));
  }, [tokenizeMiteiru]);
  useEffect(() => {
    Line.removeHearingImpairedFlag = primaryStyling.removeHearingImpaired
  }, [primaryStyling])
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
    if (isVideo(currentPath) || isYoutube(currentPath)) {
      const draggedVideo = isYoutube(currentPath) ? {
        type: 'video/youtube',
        src: currentPath,
        path: currentPath
      } : {
        type: 'video/webm',
        src: `miteiru://${pathUri}`,
        path: pathUri
      };
      setVideoSrc(draggedVideo);
      resetSub(setPrimarySub)
      resetSub(setSecondarySub)
    }
    if (isSubtitle(currentPath) || isYoutube(currentPath)) {
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
      const subLoader = (tmpSub, mustMatch = null) => {
        if(mustMatch !== null && tmpSub.language !== mustMatch) return;
        clearInterval(toastSetter);
        if (tmpSub.language === videoConstants.japaneseLang || tmpSub.language === videoConstants.cantoneseLang) {
          setPrimarySub(tmpSub);
          setGlobalSubtitleId(tmpSub.id);
        } else {
          setSecondarySub(tmpSub);
        }
        setToastInfo({
          message: 'Subtitle loaded',
          update: randomUUID()
        });
        if (tmpSub.language === videoConstants.japaneseLang || tmpSub.language === videoConstants.cantoneseLang) {
          const toastSetter = setInterval(() => {
            setToastInfo({
              message: `${tmpSub.language} cache: ${tmpSub.progress}`,
              update: randomUUID()
            });
          }, TOAST_TIMEOUT / 10);
          if(tmpSub.language === videoConstants.japaneseLang) {
            tmpSub.adjustJapanese(tokenizeMiteiru).then(() => {
              clearInterval(toastSetter);
            })
          }
          if(tmpSub.language === videoConstants.cantoneseLang) {
            tmpSub.adjustCantonese(tokenizeMiteiru).then(() => {
              clearInterval(toastSetter);
            })
          }
        }
      };
      if (isYoutube(currentPath)) {
        ipcRenderer.invoke("getYoutubeSubtitle", extractVideoId(currentPath), videoConstants.englishLang).then(entries => {
          entries = convertSubtitlesToEntries(entries)
          const tmpSub = SubtitleContainer.createFromArrayEntries(null, entries, lang)
          subLoader(tmpSub, videoConstants.englishLang);
        })
        ipcRenderer.invoke("getYoutubeSubtitle", extractVideoId(currentPath), lang).then(entries => {
          entries = convertSubtitlesToEntries(entries)
          const tmpSub = SubtitleContainer.createFromArrayEntries(null, entries, lang)
          subLoader(tmpSub, lang);
        })
      } else {
        SubtitleContainer.create(draggedSubtitle.src, lang).then(subLoader);
      }
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
