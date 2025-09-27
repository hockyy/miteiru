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
  // Helper functions
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer(''));
  }, []);

  const isLearningLanguage = useCallback((language) => {
    return [
      videoConstants.japaneseLang,
      videoConstants.cantoneseLang, 
      videoConstants.chineseLang,
      videoConstants.vietnameseLang
    ].includes(language);
  }, []);

  const processSubtitleForLearning = useCallback(async (tmpSub) => {
    const toastSetter = setInterval(() => {
      setToastInfo({
        message: `${tmpSub.language}: ${tmpSub.progress}`,
        update: uuidv4()
      });
    }, TOAST_TIMEOUT / 10);

    try {
      if (tmpSub.language === videoConstants.japaneseLang) {
        await tmpSub.adjustJapanese(tokenizeMiteiru);
      } else if (tmpSub.language === videoConstants.cantoneseLang || tmpSub.language === videoConstants.chineseLang) {
        await tmpSub.adjustChinese(tokenizeMiteiru);
      } else if (tmpSub.language === videoConstants.vietnameseLang) {
        await tmpSub.adjustVietnamese(tokenizeMiteiru);
      }
      
      clearInterval(toastSetter);
      setFrequencyPrimary(tmpSub.frequency);
    } catch (error) {
      clearInterval(toastSetter);
      console.error('Error processing subtitle:', error);
    }
  }, [tokenizeMiteiru, setFrequencyPrimary, setToastInfo]);

  const loadSubtitleAsPrimary = useCallback((tmpSub, currentPath) => {
    setPrimarySub(tmpSub);
    setLastPrimarySubPath([{path: currentPath}]);
    setGlobalSubtitleId(tmpSub.id);
    
    setToastInfo({
      message: 'Primary subtitle loaded',
      update: uuidv4()
    });

    if (isLearningLanguage(tmpSub.language)) {
      processSubtitleForLearning(tmpSub);
    }
  }, [setPrimarySub, setToastInfo, isLearningLanguage, processSubtitleForLearning]);

  const loadSubtitleAsSecondary = useCallback((tmpSub, currentPath) => {
    setSecondarySub(tmpSub);
    setLastSecondarySubPath([{path: currentPath}]);
    
    setToastInfo({
      message: 'Secondary subtitle loaded',
      update: uuidv4()
    });
  }, [setSecondarySub, setToastInfo]);

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
      const handleSubtitleLoaded = (tmpSub, mustMatch = null) => {
        if (mustMatch !== null && tmpSub.language !== mustMatch) return;
        clearInterval(toastSetter);

        if (isYoutube(currentPath)) {
          // For YouTube, auto-assign based on language
          if (isLearningLanguage(tmpSub.language)) {
            loadSubtitleAsPrimary(tmpSub, currentPath);
          } else {
            loadSubtitleAsSecondary(tmpSub, currentPath);
          }
        } else {
          // For local files, show selection modal
          setPendingSubtitle(tmpSub);
          setPendingSubtitlePath(currentPath);
          setShowSubtitleModal(true);
          setToastInfo({
            message: 'Choose subtitle type...',
            update: uuidv4()
          });
        }
      };

      if (isYoutube(currentPath)) {
        const videoId = extractVideoId(currentPath);
        
        // Load English subtitle
        window.ipc.invoke("getYoutubeSubtitle", videoId, videoConstants.englishLang).then(entries => {
          const tmpSub = SubtitleContainer.createFromArrayEntries(
            null, convertSubtitlesToEntries(entries), lang, primaryStyling.forceSimplified);
          handleSubtitleLoaded(tmpSub, videoConstants.englishLang);
        });

        // Load primary language subtitles
        const langList = videoConstants.varLang[lang] ?? [];
        langList.forEach(findLang => {
          window.ipc.invoke("getYoutubeSubtitle", videoId, findLang).then(entries => {
            const tmpSub = SubtitleContainer.createFromArrayEntries(
              null, convertSubtitlesToEntries(entries), lang, primaryStyling.forceSimplified);
            handleSubtitleLoaded(tmpSub, lang);
          });
        });
      } else {
        SubtitleContainer.create(draggedSubtitle.src, lang, primaryStyling.forceSimplified)
          .then(handleSubtitleLoaded);
      }
    }
    queue.end(currentHash);
  }, [lang, primaryStyling.forceSimplified, queue, resetSub, isLearningLanguage, loadSubtitleAsPrimary, loadSubtitleAsSecondary, setToastInfo]);

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

  // Modal handlers
  const cleanupModal = useCallback(() => {
    setShowSubtitleModal(false);
    setPendingSubtitle(null);
    setPendingSubtitlePath('');
  }, []);

  const handleSelectPrimary = useCallback(() => {
    if (!pendingSubtitle) return;
    loadSubtitleAsPrimary(pendingSubtitle, pendingSubtitlePath);
    cleanupModal();
  }, [pendingSubtitle, pendingSubtitlePath, loadSubtitleAsPrimary, cleanupModal]);

  const handleSelectSecondary = useCallback(() => {
    if (!pendingSubtitle) return;
    loadSubtitleAsSecondary(pendingSubtitle, pendingSubtitlePath);
    cleanupModal();
  }, [pendingSubtitle, pendingSubtitlePath, loadSubtitleAsSecondary, cleanupModal]);

  const handleCloseModal = useCallback(() => {
    cleanupModal();
    setToastInfo({
      message: 'Subtitle loading cancelled',
      update: uuidv4()
    });
  }, [cleanupModal, setToastInfo]);

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
