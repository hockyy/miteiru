import {useCallback, useEffect, useState} from 'react';
import {
  convertSubtitlesToEntries,
  Line,
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {v4 as uuidv4} from 'uuid';
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
  
  // Subtitle selection modal state
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [pendingSubtitle, setPendingSubtitle] = useState(null);
  const [pendingSubtitlePath, setPendingSubtitlePath] = useState('');
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer(''));
  }, []);
  useEffect(() => {
    Line.removeHearingImpairedFlag = primaryStyling.removeHearingImpaired
  }, [primaryStyling])
  const onLoadFiles = useCallback(async acceptedFiles => {
    const currentHash = Symbol();
    await queue.wait(currentHash);
    let currentPath = await acceptedFiles[0].path;
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
        update: uuidv4()
      });
      const toastSetter = setInterval(() => {
        setToastInfo({
          message: 'Still loading subtitle, please wait!',
          update: uuidv4()
        });
      }, TOAST_TIMEOUT);
      const draggedSubtitle = {
        type: 'text/plain',
        src: `${currentPath}`
      };
      const subLoader = (tmpSub, mustMatch = null) => {
        console.log(tmpSub);
        if (mustMatch !== null && tmpSub.language !== mustMatch) return;
        clearInterval(toastSetter);
        
        // Store subtitle and path for modal selection
        setPendingSubtitle(tmpSub);
        setPendingSubtitlePath(currentPath);
        setShowSubtitleModal(true);
        
        setToastInfo({
          message: 'Choose subtitle type...',
          update: uuidv4()
        });
      };
      if (isYoutube(currentPath)) {
        // For YouTube, still use the old automatic behavior since we can distinguish by language
        const originalSubLoader = (tmpSub, mustMatch = null) => {
          console.log(tmpSub);
          if (mustMatch !== null && tmpSub.language !== mustMatch) return;
          clearInterval(toastSetter);
          if (tmpSub.language === videoConstants.japaneseLang
              || tmpSub.language === videoConstants.cantoneseLang
              || tmpSub.language === videoConstants.chineseLang
              || tmpSub.language === videoConstants.vietnameseLang) {
            setPrimarySub(tmpSub);
            setLastPrimarySubPath([{path: currentPath}]);
            setGlobalSubtitleId(tmpSub.id);
          } else {
            setLastSecondarySubPath([{path: currentPath}]);
            setSecondarySub(tmpSub);
          }
          setToastInfo({
            message: 'Subtitle loaded',
            update: uuidv4()
          });
          console.log(tmpSub.language);
          if (tmpSub.language === videoConstants.japaneseLang
              || tmpSub.language === videoConstants.cantoneseLang
              || tmpSub.language === videoConstants.chineseLang
              || tmpSub.language === videoConstants.vietnameseLang) {
            const toastSetter = setInterval(() => {
              setToastInfo({
                message: `${tmpSub.language}: ${tmpSub.progress}`,
                update: uuidv4()
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
            if (tmpSub.language === videoConstants.vietnameseLang) {
              console.log(tmpSub);
              tmpSub.adjustVietnamese(tokenizeMiteiru).then(() => {
                clearInterval(toastSetter);
                setFrequencyPrimary(tmpSub.frequency)
              })
            }
          }
        };
        
        window.ipc.invoke("getYoutubeSubtitle", extractVideoId(currentPath), videoConstants.englishLang).then(entries => {
          entries = convertSubtitlesToEntries(entries)
          const tmpSub = SubtitleContainer.createFromArrayEntries(
              null, entries, lang, primaryStyling.forceSimplified)
          originalSubLoader(tmpSub, videoConstants.englishLang);
        })
        const langList = videoConstants.varLang[lang] ?? [];
        for (const findLang of langList) {
          window.ipc.invoke("getYoutubeSubtitle", extractVideoId(currentPath), findLang).then(entries => {
            entries = convertSubtitlesToEntries(entries)
            const tmpSub = SubtitleContainer.createFromArrayEntries(
                null, entries, lang, primaryStyling.forceSimplified);
            originalSubLoader(tmpSub, lang);
          })
        }
      } else {
        SubtitleContainer.create(draggedSubtitle.src, lang, primaryStyling.forceSimplified).then(subLoader);
      }
    }
    queue.end(currentHash);
  }, [lang, primaryStyling.forceSimplified, queue, resetSub, setFrequencyPrimary, setPrimarySub, setSecondarySub, setToastInfo, tokenizeMiteiru]);

  // Handler for when lyrics are downloaded
  const loadPath = useCallback((lyricsPath) => {
    // Auto-load the downloaded lyrics as primary subtitle
    if (lyricsPath) {
      onLoadFiles([{path: lyricsPath}]);
    }
  },[onLoadFiles]);

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

  // Handler for selecting primary subtitle
  const handleSelectPrimary = useCallback(() => {
    if (!pendingSubtitle) return;
    
    const tmpSub = pendingSubtitle;
    const currentPath = pendingSubtitlePath;
    
    // Load as primary subtitle
    setPrimarySub(tmpSub);
    setLastPrimarySubPath([{path: currentPath}]);
    setGlobalSubtitleId(tmpSub.id);
    
    setToastInfo({
      message: 'Primary subtitle loaded',
      update: uuidv4()
    });
    
    // Process the subtitle if it's a learning language
    if (tmpSub.language === videoConstants.japaneseLang
        || tmpSub.language === videoConstants.cantoneseLang
        || tmpSub.language === videoConstants.chineseLang
        || tmpSub.language === videoConstants.vietnameseLang) {
      const toastSetter = setInterval(() => {
        setToastInfo({
          message: `${tmpSub.language}: ${tmpSub.progress}`,
          update: uuidv4()
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
      if (tmpSub.language === videoConstants.vietnameseLang) {
        tmpSub.adjustVietnamese(tokenizeMiteiru).then(() => {
          clearInterval(toastSetter);
          setFrequencyPrimary(tmpSub.frequency)
        })
      }
    }
    
    // Clean up
    setShowSubtitleModal(false);
    setPendingSubtitle(null);
    setPendingSubtitlePath('');
  }, [pendingSubtitle, pendingSubtitlePath, setPrimarySub, setToastInfo, tokenizeMiteiru, setFrequencyPrimary]);

  // Handler for selecting secondary subtitle
  const handleSelectSecondary = useCallback(() => {
    if (!pendingSubtitle) return;
    
    const tmpSub = pendingSubtitle;
    const currentPath = pendingSubtitlePath;
    
    // Load as secondary subtitle
    setSecondarySub(tmpSub);
    setLastSecondarySubPath([{path: currentPath}]);
    
    setToastInfo({
      message: 'Secondary subtitle loaded',
      update: uuidv4()
    });
    
    // Clean up
    setShowSubtitleModal(false);
    setPendingSubtitle(null);
    setPendingSubtitlePath('');
  }, [pendingSubtitle, pendingSubtitlePath, setSecondarySub, setToastInfo]);

  // Handler for closing the modal
  const handleCloseModal = useCallback(() => {
    setShowSubtitleModal(false);
    setPendingSubtitle(null);
    setPendingSubtitlePath('');
    setToastInfo({
      message: 'Subtitle loading cancelled',
      update: uuidv4()
    });
  }, [setToastInfo]);

  // Get display name for detected language
  const getLanguageDisplayName = useCallback((langCode) => {
    switch (langCode) {
      case videoConstants.japaneseLang: return 'Japanese';
      case videoConstants.chineseLang: return 'Chinese';
      case videoConstants.cantoneseLang: return 'Cantonese';
      case videoConstants.vietnameseLang: return 'Vietnamese';
      case videoConstants.englishLang: return 'English';
      default: return langCode;
    }
  }, []);

  return {
    onLoadFiles,
    videoSrc,
    onVideoChangeHandler,
    reloadLastPrimarySubtitle,
    reloadLastSecondarySubtitle,
    loadPath,
    // Subtitle modal state and handlers
    showSubtitleModal,
    pendingSubtitlePath,
    currentAppLanguage: getLanguageDisplayName(lang),
    handleSelectPrimary,
    handleSelectSecondary,
    handleCloseModal
  }
};

export default useLoadFiles;
