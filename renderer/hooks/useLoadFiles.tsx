import {useCallback, useEffect, useState} from 'react';
import {
  convertSubtitlesToEntries,
  Line,
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {randomUUID} from "crypto";
import {TOAST_TIMEOUT} from "../components/VideoPlayer/Toast";
import {extractVideoId, isLocalPath, isSubtitle, isVideo, isYoutube} from "../utils/utils";
import {findPositionDeltaInFolder} from "../utils/folderUtils";
import {useAsyncAwaitQueue} from "./useAsyncAwaitQueue";
import {videoConstants} from "../utils/constants";

const useLoadFiles = (setToastInfo, primarySub, setPrimarySub,
                      secondarySub, setSecondarySub,
                      primaryStyling,
                      tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang, setFrequencyPrimary) => {
  const [videoSrc, setVideoSrc] = useState({
    src: '',
    type: '',
    path: ''
  });
  const queue = useAsyncAwaitQueue();

  const [lastPrimarySubPath, setLastPrimarySubPath] = useState([{path: ''}]);
  const [lastSecondarySubPath, setLastSecondarySubPath] = useState([{path: ''}]);
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer(''));
  }, []);
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
      if (process.platform === 'win32' && !pathUri.startsWith('/')) {
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
        if (mustMatch !== null && tmpSub.language !== mustMatch) return;
        clearInterval(toastSetter);
        if (tmpSub.language === videoConstants.japaneseLang
            || tmpSub.language === videoConstants.cantoneseLang
            || tmpSub.language === videoConstants.chineseLang) {
          setPrimarySub(tmpSub);
          setLastPrimarySubPath([{path: currentPath}]);  // Save the last primary subtitle path
          setGlobalSubtitleId(tmpSub.id);
        } else {
          setLastSecondarySubPath([{path: currentPath}]);  // Save the last secondary subtitle path
          setSecondarySub(tmpSub);
        }
        setToastInfo({
          message: 'Subtitle loaded',
          update: randomUUID()
        });
        if (tmpSub.language === videoConstants.japaneseLang
            || tmpSub.language === videoConstants.cantoneseLang
            || tmpSub.language === videoConstants.chineseLang) {
          const toastSetter = setInterval(() => {
            setToastInfo({
              message: `${tmpSub.language}: ${tmpSub.progress}`,
              update: randomUUID()
            });
          }, TOAST_TIMEOUT / 10);
          if (tmpSub.language === videoConstants.japaneseLang) {
            tmpSub.adjustJapanese(tokenizeMiteiru).then(() => {
              clearInterval(toastSetter);
              setFrequencyPrimary(tmpSub.frequency)
            })
          }
          if (tmpSub.language === videoConstants.cantoneseLang || tmpSub.language === videoConstants.chineseLang) {
            tmpSub.adjustChinese(tokenizeMiteiru).then(() => {
              clearInterval(toastSetter);
              setFrequencyPrimary(tmpSub.frequency)
            })
          }
        }
      };
      if (isYoutube(currentPath)) {
        window.ipc.invoke("getYoutubeSubtitle", extractVideoId(currentPath), videoConstants.englishLang).then(entries => {
          entries = convertSubtitlesToEntries(entries)
          const tmpSub = SubtitleContainer.createFromArrayEntries(
              null, entries, lang, primaryStyling.forceSimplified)
          subLoader(tmpSub, videoConstants.englishLang);
        })
        const langList = videoConstants.varLang[lang] ?? [];
        for (const findLang of langList) {
          window.ipc.invoke("getYoutubeSubtitle", extractVideoId(currentPath), findLang).then(entries => {
            entries = convertSubtitlesToEntries(entries)
            const tmpSub = SubtitleContainer.createFromArrayEntries(
                null, entries, lang, primaryStyling.forceSimplified);
            subLoader(tmpSub, lang);
          })
        }
      } else {
        SubtitleContainer.create(draggedSubtitle.src, lang, primaryStyling.forceSimplified).then(subLoader);
      }
    }
    queue.end(currentHash);
  }, [lang, primaryStyling.forceSimplified, queue, resetSub, setFrequencyPrimary, setPrimarySub, setSecondarySub, setToastInfo, tokenizeMiteiru]);

  const onVideoChangeHandler = useCallback(async (delta: number = 1) => {
    if (!isLocalPath(videoSrc.path)) return;
    if (videoSrc.path) {
      const nextVideo = findPositionDeltaInFolder(videoSrc.path, delta);
      if (await nextVideo !== '') {
        await onLoadFiles([{path: nextVideo}]);
      } else {
        setEnableSeeker(true);
      }
    }
    if (primarySub.path) {
      const nextPrimary = findPositionDeltaInFolder(primarySub.path, delta);
      if (await nextPrimary !== '') {
        await onLoadFiles([{path: nextPrimary}]);
      }
    }
    if (secondarySub.path) {
      const nextSecondary = findPositionDeltaInFolder(secondarySub.path, delta);
      if (await nextSecondary !== '') {
        await onLoadFiles([{path: nextSecondary}]);
      }
    }
  }, [videoSrc.path, primarySub.path, secondarySub.path, onLoadFiles, setEnableSeeker]);

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
  }, [changeTimeTo, player, setEnableSeeker, videoSrc.path])

  const reloadLastPrimarySubtitle = useCallback(() => {
    if (lastPrimarySubPath) {
      onLoadFiles(lastPrimarySubPath);
    }
  }, [lastPrimarySubPath, onLoadFiles]);

  const reloadLastSecondarySubtitle = useCallback(() => {
    if (lastSecondarySubPath) {
      onLoadFiles(lastSecondarySubPath);
    }
  }, [lastSecondarySubPath, onLoadFiles]);
  return {
    onLoadFiles,
    videoSrc,
    onVideoChangeHandler,
    reloadLastPrimarySubtitle,
    reloadLastSecondarySubtitle
  }
};

export default useLoadFiles;
