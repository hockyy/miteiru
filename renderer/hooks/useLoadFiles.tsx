import {useCallback, useEffect, useMemo, useState} from 'react';
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
import {isLearningSubtitleLanguage} from "../components/Subtitle/subtitleLanguageSupport";
import {
  buildVideoSource,
  getEmbeddedSubtitleTarget,
  getLanguageDisplayName,
  isEmbeddedSubtitlePath,
  normalizeDroppedPath
} from "../utils/mediaUtils";

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

  const showToast = useCallback((message: string) => {
    setToastInfo({
      message,
      update: uuidv4()
    });
  }, [setToastInfo]);

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
        showToast(`${tmpSub.language}: ${tmpSub.progress}`);
      }, TOAST_TIMEOUT / 10);

      await tmpSub.adjustForLearning(tokenizeMiteiru);
      
      setFrequencyPrimary(tmpSub.frequency);
    } catch (error) {
      console.error('Error processing subtitle:', error);
      showToast(`Error processing subtitle: ${error.message}`);
    } finally {
      // Always clear the interval
      if (toastSetter) {
        clearInterval(toastSetter);
        toastSetter = null;
      }
    }
  }, [tokenizeMiteiru, setFrequencyPrimary, showToast]);

  const loadSubtitleAsPrimary = useCallback((tmpSub, currentPath) => {
    setPrimarySub(tmpSub);
    setLastPrimarySubPath([{path: currentPath}]);
    setGlobalSubtitleId(tmpSub.id);
    
    showToast('Primary subtitle loaded');

    if (isLearningLanguage(tmpSub.language)) {
      processSubtitleForLearning(tmpSub);
    }
  }, [setPrimarySub, showToast, isLearningLanguage, processSubtitleForLearning]);

  const loadSubtitleAsSecondary = useCallback((tmpSub, currentPath) => {
    setSecondarySub(tmpSub);
    setLastSecondarySubPath([{path: currentPath}]);
    
    showToast('Secondary subtitle loaded');
  }, [setSecondarySub, showToast]);

  useEffect(() => {
    Line.removeHearingImpairedFlag = primaryStyling.removeHearingImpaired
  }, [primaryStyling.removeHearingImpaired])

  const loadVideoFile = useCallback((currentPath: string, pathUri: string) => {
    setVideoSrc(buildVideoSource(currentPath, pathUri));
    resetSub(setPrimarySub);
    resetSub(setSecondarySub);
  }, [resetSub, setPrimarySub, setSecondarySub]);

  const routeLoadedSubtitle = useCallback((tmpSub, loadedPath: string, currentPath: string) => {
    if (isYoutube(currentPath)) {
      console.log(`[useLoadFiles] YouTube video detected: ${currentPath}`);
      console.log('[useLoadFiles] Skipping auto-subtitle loading - user should select via modal');
      return;
    }

    if (isEmbeddedSubtitlePath(currentPath)) {
      console.log('[useLoadFiles] Loading subtitle file directly:', loadedPath);
      const target = getEmbeddedSubtitleTarget(currentPath);
      if (target === 'secondary') {
        loadSubtitleAsSecondary(tmpSub, loadedPath);
      } else {
        loadSubtitleAsPrimary(tmpSub, loadedPath);
      }
      return;
    }

    setPendingSubtitle(tmpSub);
    setPendingSubtitlePath(currentPath);
    setShowSubtitleModal(true);
    showToast('Choose subtitle type...');
  }, [loadSubtitleAsPrimary, loadSubtitleAsSecondary, showToast]);

  const loadSubtitleFile = useCallback(async (currentPath: string) => {
    if (isYoutube(currentPath)) {
      console.log(`[useLoadFiles] YouTube video detected: ${currentPath}`);
      console.log('[useLoadFiles] Skipping auto-subtitle loading - user should select via modal');
      return;
    }

    showToast('Loading subtitle, please wait!');
    let toastSetter = null;

    try {
      toastSetter = setInterval(() => {
        showToast('Still loading subtitle, please wait!');
      }, TOAST_TIMEOUT);

      const {tmpSub, subtitlePath} = await createSubtitleContainer(currentPath);
      routeLoadedSubtitle(tmpSub, subtitlePath, currentPath);
    } catch (error) {
      console.error('[useLoadFiles] Failed to load subtitle file:', error);
      showToast(`Failed to load subtitle: ${error.message}`);
    } finally {
      if (toastSetter) clearInterval(toastSetter);
    }
  }, [createSubtitleContainer, routeLoadedSubtitle, showToast]);

  const onLoadFiles = useCallback(async (acceptedFiles) => {
    const currentHash = Symbol();
    await queue.wait(currentHash);

    try {
      const droppedPath = await acceptedFiles[0]?.path;
      if (!droppedPath) return;

      const {currentPath, pathUri} = normalizeDroppedPath(droppedPath);
      if (isVideo(currentPath) || isYoutube(currentPath)) {
        loadVideoFile(currentPath, pathUri);
      }

      if (isSubtitle(currentPath) || isYoutube(currentPath)) {
        await loadSubtitleFile(currentPath);
      }
    } catch (error) {
      console.error('[useLoadFiles] Error in file loading pipeline:', error);
      showToast(`Error: ${error.message}`);
    } finally {
      queue.end(currentHash);
    }
  }, [queue, loadVideoFile, loadSubtitleFile, showToast]);

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

  const loadPendingSubtitleAs = useCallback(async (target: 'primary' | 'secondary') => {
    if (!pendingSubtitle) return;
    try {
      if (subtitlePreprocessOptions.titleCaseAllCaps) {
        const {tmpSub, subtitlePath} = await createSubtitleContainer(pendingSubtitlePath, subtitlePreprocessOptions);
        if (target === 'primary') loadSubtitleAsPrimary(tmpSub, subtitlePath);
        else loadSubtitleAsSecondary(tmpSub, subtitlePath);
      } else {
        if (target === 'primary') loadSubtitleAsPrimary(pendingSubtitle, pendingSubtitlePath);
        else loadSubtitleAsSecondary(pendingSubtitle, pendingSubtitlePath);
      }
      cleanupModal();
    } catch (error) {
      console.error('[useLoadFiles] Failed to preprocess subtitle:', error);
      showToast(`Failed to preprocess subtitle: ${error.message}`);
    }
  }, [
    pendingSubtitle,
    pendingSubtitlePath,
    subtitlePreprocessOptions,
    createSubtitleContainer,
    loadSubtitleAsPrimary,
    loadSubtitleAsSecondary,
    cleanupModal,
    showToast
  ]);

  const handleSelectPrimary = useCallback(async () => {
    await loadPendingSubtitleAs('primary');
  }, [loadPendingSubtitleAs]);

  const handleSelectSecondary = useCallback(async () => {
    await loadPendingSubtitleAs('secondary');
  }, [loadPendingSubtitleAs]);

  const handleCloseModal = useCallback(() => {
    cleanupModal();
    showToast('Subtitle loading cancelled');
  }, [cleanupModal, showToast]);

  const currentAppLanguage = useMemo(() => getLanguageDisplayName(lang), [lang]);

  // Enhanced load for embedded subtitles with type specification
  const loadEmbeddedSubtitle = useCallback(async (filePath: string, type: 'primary' | 'secondary', preprocessOptions: SubtitlePreprocessOptions = DEFAULT_SUBTITLE_PREPROCESS_OPTIONS) => {
    console.log(`[useLoadFiles] loadEmbeddedSubtitle called: ${type} from ${filePath}`);

    try {
      const {tmpSub, subtitlePath} = await createSubtitleContainer(filePath, preprocessOptions);
      console.log(`[useLoadFiles] Direct loading ${type} subtitle:`, tmpSub);
      if (type === 'primary') {
        loadSubtitleAsPrimary(tmpSub, subtitlePath);
      } else {
        loadSubtitleAsSecondary(tmpSub, subtitlePath);
      }
    } catch (error) {
      console.error(`[useLoadFiles] Failed to load ${type} embedded subtitle:`, error);
      showToast(`Failed to load ${type} subtitle`);
    }
  }, [createSubtitleContainer, loadSubtitleAsPrimary, loadSubtitleAsSecondary, showToast]);

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
    currentAppLanguage,
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
