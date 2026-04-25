import {useCallback, useEffect, useState} from 'react';
import {
  Line,
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {SubtitlePreprocessOptions} from "../types/subtitlePreprocess";
import {v4 as uuidv4} from 'uuid';
import {TOAST_TIMEOUT} from "../components/VideoPlayer/Toast";
import {isLocalPath, isSubtitle, isVideo, isYoutube} from "../utils/utils";
import {findPositionDeltaInFolder} from "../utils/folderUtils";
import {useAsyncAwaitQueue} from "./useAsyncAwaitQueue";
import {videoConstants} from "../utils/constants";
import {isLearningSubtitleLanguage} from "../components/Subtitle/subtitleLanguageSupport";

const DEFAULT_SUBTITLE_PREPROCESS_OPTIONS: SubtitlePreprocessOptions = {
  titleCaseAllCaps: true
};

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
  const [subtitlePreprocessOptions, setSubtitlePreprocessOptions] = useState<SubtitlePreprocessOptions>(DEFAULT_SUBTITLE_PREPROCESS_OPTIONS);
  // Helper functions
  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer(''));
  }, []);

  const isLearningLanguage = useCallback(isLearningSubtitleLanguage, []);

  const createSubtitleContainer = useCallback(async (filePath: string, preprocessOptions: SubtitlePreprocessOptions = DEFAULT_SUBTITLE_PREPROCESS_OPTIONS) => {
    const subtitlePath = preprocessOptions.titleCaseAllCaps
      ? await window.electronAPI.preprocessSubtitleCapitalization(filePath)
      : filePath;

    const tmpSub = await SubtitleContainer.create(subtitlePath, lang, primaryStyling.forceSimplified);
    return {tmpSub, subtitlePath};
  }, [lang, primaryStyling.forceSimplified]);

  const processSubtitleForLearning = useCallback(async (tmpSub) => {
    let toastSetter = null;
    
    try {
      toastSetter = setInterval(() => {
        setToastInfo({
          message: `${tmpSub.language}: ${tmpSub.progress}`,
          update: uuidv4()
        });
      }, TOAST_TIMEOUT / 10);

      await tmpSub.adjustForLearning(tokenizeMiteiru);
      
      setFrequencyPrimary(tmpSub.frequency);
    } catch (error) {
      console.error('Error processing subtitle:', error);
      setToastInfo({
        message: `Error processing subtitle: ${error.message}`,
        update: uuidv4()
      });
    } finally {
      // Always clear the interval
      if (toastSetter) {
        clearInterval(toastSetter);
        toastSetter = null;
      }
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
  const onLoadFiles = useCallback(async (acceptedFiles) => {
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
      
      let toastSetter = null;
      
      try {
        toastSetter = setInterval(() => {
          setToastInfo({
            message: 'Still loading subtitle, please wait!',
            update: uuidv4()
          });
        }, TOAST_TIMEOUT);
        
        const draggedSubtitle = {
          type: 'text/plain',
          src: `${currentPath}`
        };
        
        const handleSubtitleLoaded = (tmpSub, loadedPath, mustMatch = null) => {
          if (mustMatch !== null && tmpSub.language !== mustMatch) return;
          
          // Clear the interval immediately when subtitle is loaded
          if (toastSetter) {
            clearInterval(toastSetter);
            toastSetter = null;
          }

          if (isYoutube(currentPath)) {
            // For YouTube videos, don't auto-load subtitles
            // The MediaTrackSelectionModal should handle subtitle selection
            console.log(`[useLoadFiles] YouTube video detected: ${currentPath}`);
            console.log(`[useLoadFiles] Skipping auto-subtitle loading - user should select via modal`);
            return;
          } else {
            // Check if this is an embedded subtitle file (temporary file)
            const isEmbeddedSubtitle = currentPath.includes('miteiru_subtitle_') || currentPath.includes('miteiru_youtube_');
            
            if (isEmbeddedSubtitle) {
              // For embedded/downloaded subtitles, load directly
              console.log('[useLoadFiles] Loading subtitle file directly:', loadedPath);
              
              // Determine type based on filename or assume primary
              if (currentPath.includes('secondary') || currentPath.includes('_sec_')) {
                loadSubtitleAsSecondary(tmpSub, loadedPath);
              } else {
                loadSubtitleAsPrimary(tmpSub, loadedPath);
              }
            } else {
              // For external files, show selection modal
              setPendingSubtitle(tmpSub);
              setPendingSubtitlePath(currentPath);
              setShowSubtitleModal(true);
              setToastInfo({
                message: 'Choose subtitle type...',
                update: uuidv4()
              });
            }
          }
        };

        if (isYoutube(currentPath)) {
          // For YouTube videos, clear toast and skip subtitle loading
          if (toastSetter) {
            clearInterval(toastSetter);
            toastSetter = null;
          }
          console.log(`[useLoadFiles] YouTube video detected: ${currentPath}`);
          console.log(`[useLoadFiles] Skipping auto-subtitle loading - user should select via modal`);
        } else {
          createSubtitleContainer(draggedSubtitle.src)
            .then(({tmpSub, subtitlePath}) => handleSubtitleLoaded(tmpSub, subtitlePath))
            .catch(error => {
              console.error('[useLoadFiles] Failed to load subtitle file:', error);
              if (toastSetter) {
                clearInterval(toastSetter);
                toastSetter = null;
              }
              setToastInfo({
                message: `Failed to load subtitle: ${error.message}`,
                update: uuidv4()
              });
            });
        }
      } catch (error) {
        // Clean up interval on any error
        if (toastSetter) {
          clearInterval(toastSetter);
          toastSetter = null;
        }
        console.error('[useLoadFiles] Error in subtitle loading pipeline:', error);
        setToastInfo({
          message: `Error: ${error.message}`,
          update: uuidv4()
        });
      }
    }
    queue.end(currentHash);
  }, [
    queue,
    resetSub,
    createSubtitleContainer,
    loadSubtitleAsPrimary,
    loadSubtitleAsSecondary,
    setPrimarySub,
    setSecondarySub,
    setToastInfo
  ]);

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
    setSubtitlePreprocessOptions(DEFAULT_SUBTITLE_PREPROCESS_OPTIONS);
  }, []);

  const handleSelectPrimary = useCallback(async () => {
    if (!pendingSubtitle) return;
    try {
      if (subtitlePreprocessOptions.titleCaseAllCaps) {
        const {tmpSub, subtitlePath} = await createSubtitleContainer(pendingSubtitlePath, subtitlePreprocessOptions);
        loadSubtitleAsPrimary(tmpSub, subtitlePath);
      } else {
        loadSubtitleAsPrimary(pendingSubtitle, pendingSubtitlePath);
      }
      cleanupModal();
    } catch (error) {
      console.error('[useLoadFiles] Failed to preprocess subtitle:', error);
      setToastInfo({
        message: `Failed to preprocess subtitle: ${error.message}`,
        update: uuidv4()
      });
    }
  }, [pendingSubtitle, pendingSubtitlePath, subtitlePreprocessOptions, createSubtitleContainer, loadSubtitleAsPrimary, cleanupModal, setToastInfo]);

  const handleSelectSecondary = useCallback(async () => {
    if (!pendingSubtitle) return;
    try {
      if (subtitlePreprocessOptions.titleCaseAllCaps) {
        const {tmpSub, subtitlePath} = await createSubtitleContainer(pendingSubtitlePath, subtitlePreprocessOptions);
        loadSubtitleAsSecondary(tmpSub, subtitlePath);
      } else {
        loadSubtitleAsSecondary(pendingSubtitle, pendingSubtitlePath);
      }
      cleanupModal();
    } catch (error) {
      console.error('[useLoadFiles] Failed to preprocess subtitle:', error);
      setToastInfo({
        message: `Failed to preprocess subtitle: ${error.message}`,
        update: uuidv4()
      });
    }
  }, [pendingSubtitle, pendingSubtitlePath, subtitlePreprocessOptions, createSubtitleContainer, loadSubtitleAsSecondary, cleanupModal, setToastInfo]);

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

  // Enhanced load for embedded subtitles with type specification
  const loadEmbeddedSubtitle = useCallback((filePath: string, type: 'primary' | 'secondary', preprocessOptions: SubtitlePreprocessOptions = DEFAULT_SUBTITLE_PREPROCESS_OPTIONS) => {
    console.log(`[useLoadFiles] loadEmbeddedSubtitle called: ${type} from ${filePath}`);
    
    // Create a pseudo subtitle object for direct loading
    const draggedSubtitle = {
      type: 'text/plain',
      src: filePath
    };

    const directLoader = (tmpSub, loadedPath = filePath) => {
      console.log(`[useLoadFiles] Direct loading ${type} subtitle:`, tmpSub);
      
      if (type === 'primary') {
        loadSubtitleAsPrimary(tmpSub, loadedPath);
      } else {
        loadSubtitleAsSecondary(tmpSub, loadedPath);
      }
    };

    createSubtitleContainer(draggedSubtitle.src, preprocessOptions)
      .then(({tmpSub, subtitlePath}) => directLoader(tmpSub, subtitlePath))
      .catch(error => {
        console.error(`[useLoadFiles] Failed to load ${type} embedded subtitle:`, error);
        setToastInfo({
          message: `Failed to load ${type} subtitle`,
          update: uuidv4()
        });
      });
  }, [createSubtitleContainer, loadSubtitleAsPrimary, loadSubtitleAsSecondary, setToastInfo]);

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
    subtitlePreprocessOptions,
    setSubtitlePreprocessOptions,
    handleSelectPrimary,
    handleSelectSecondary,
    handleCloseModal,
    // Embedded subtitle loading
    loadEmbeddedSubtitle
  }
};

export default useLoadFiles;
