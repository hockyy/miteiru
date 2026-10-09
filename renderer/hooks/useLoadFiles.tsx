import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  isCurrentSubtitle,
  Line,
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {SubtitlePreprocessOptions} from "../types/subtitlePreprocess";
import {v4 as uuidv4} from 'uuid';
import {TOAST_TIMEOUT} from "../components/VideoPlayer/Toast";
import {isLocalPath, isSubtitle, isVideo, isYoutube} from "../utils/utils";
import {findPositionDeltaInFolder} from "../utils/folderUtils";
import {useSerialRunner} from "./useSerialRunner";
import {isLearningSubtitleLanguage} from "../components/Subtitle/subtitleLanguageSupport";
import {
  buildVideoSource,
  getLanguageDisplayName,
  isMiteiruTempSubtitle,
  knownSubtitleTarget,
  normalizeDroppedPath,
  type SubtitleTarget
} from "../utils/mediaUtils";
import {videoConstants} from "../utils/constants";
import {findCachedYoutubeLyricsPath} from "../utils/lyricsUtils";

const DEFAULT_SUBTITLE_PREPROCESS_OPTIONS: SubtitlePreprocessOptions = {
  titleCaseAllCaps: true
};

const useLoadFiles = (setToastInfo, primarySub, setPrimarySub,
                      secondarySub, setSecondarySub,
                      primaryStyling,
                      tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang, setFrequencyPrimary,
                      toneType, setPrimaryTimeCache) => {
  const [videoSrc, setVideoSrc] = useState({
    src: '',
    type: '',
    path: ''
  });
  const runSerially = useSerialRunner();

  const [lastPrimarySubPath, setLastPrimarySubPath] = useState([{path: ''}]);
  const [lastSecondarySubPath, setLastSecondarySubPath] = useState([{path: ''}]);
  
  // Subtitle selection modal state
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [pendingSubtitle, setPendingSubtitle] = useState(null);
  const [pendingSubtitlePath, setPendingSubtitlePath] = useState('');
  const [subtitlePreprocessOptions, setSubtitlePreprocessOptions] = useState<SubtitlePreprocessOptions>(DEFAULT_SUBTITLE_PREPROCESS_OPTIONS);
  // The all-caps choice each slot's subtitle was loaded with, so the next episode's is read the same way.
  const slotPreprocessOptions = useRef<Partial<Record<SubtitleTarget, SubtitlePreprocessOptions>>>({});
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
    if (!tmpSub) {
      throw new Error(`Subtitle parser returned no data for: ${subtitlePath}`);
    }
    // The subtitle is named after the user's file (window title), not the sentence-case copy it was read from.
    tmpSub.path = filePath;
    return {tmpSub, subtitlePath};
  }, [lang, primaryStyling.forceSimplified]);

  const processSubtitleForLearning = useCallback(async (tmpSub) => {
    let toastSetter = null;
    
    try {
      toastSetter = setInterval(() => {
        showToast(`${tmpSub.language}: ${tmpSub.progress}`);
      }, TOAST_TIMEOUT / 10);

      await tmpSub.adjustForLearning(tokenizeMiteiru);

      // A newer subtitle may have replaced this one while it was processing.
      if (isCurrentSubtitle(tmpSub.id)) setFrequencyPrimary(tmpSub.frequency);
      setPrimaryTimeCache?.([]);
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
  }, [tokenizeMiteiru, setFrequencyPrimary, showToast, setPrimaryTimeCache]);

  const loadSubtitleAsPrimary = useCallback((tmpSub, sourcePath) => {
    setPrimarySub(tmpSub);
    setLastPrimarySubPath([{path: sourcePath}]);
    setGlobalSubtitleId(tmpSub.id);
    // Until this subtitle is analysed, the previous one's frequent words must not be highlighted.
    setFrequencyPrimary(new Map());

    showToast('Primary subtitle loaded');

    if (isLearningLanguage(tmpSub.language)) {
      processSubtitleForLearning(tmpSub);
    }
  }, [setPrimarySub, showToast, isLearningLanguage, processSubtitleForLearning, setFrequencyPrimary]);

  const loadSubtitleAsSecondary = useCallback((tmpSub, sourcePath) => {
    setSecondarySub(tmpSub);
    setLastSecondarySubPath([{path: sourcePath}]);
    
    showToast('Secondary subtitle loaded');
  }, [setSecondarySub, showToast]);

  const loadEmbeddedSubtitle = useCallback(async (filePath: string, type: 'primary' | 'secondary', preprocessOptions: SubtitlePreprocessOptions = DEFAULT_SUBTITLE_PREPROCESS_OPTIONS) => {
    console.log(`[useLoadFiles] loadEmbeddedSubtitle called: ${type} from ${filePath}`);

    try {
      const {tmpSub} = await createSubtitleContainer(filePath, preprocessOptions);
      console.log(`[useLoadFiles] Direct loading ${type} subtitle:`, tmpSub);
      if (type === 'primary') {
        loadSubtitleAsPrimary(tmpSub, filePath);
      } else {
        loadSubtitleAsSecondary(tmpSub, filePath);
      }
    } catch (error) {
      console.error(`[useLoadFiles] Failed to load ${type} embedded subtitle:`, error);
      showToast(`Failed to load ${type} subtitle`);
    }
  }, [createSubtitleContainer, loadSubtitleAsPrimary, loadSubtitleAsSecondary, showToast]);

  const tryAutoLoadYoutubeLyrics = useCallback(async (videoPath: string) => {
    try {
      const lyricsPath = await findCachedYoutubeLyricsPath(videoPath, window.electronAPI);
      if (!lyricsPath) {
        return;
      }
      console.log(`[useLoadFiles] Auto-loading cached YouTube lyrics: ${lyricsPath}`);
      await loadEmbeddedSubtitle(lyricsPath, 'primary');
    } catch (error) {
      console.error('[useLoadFiles] Failed to auto-load YouTube lyrics:', error);
    }
  }, [loadEmbeddedSubtitle]);

  const reloadSubtitleWithoutPrompt = useCallback(async (filePath: string, target: 'primary' | 'secondary') => {
    if (!filePath) return;
    try {
      const {tmpSub} = await createSubtitleContainer(filePath);
      if (target === 'primary') {
        loadSubtitleAsPrimary(tmpSub, filePath);
      } else {
        loadSubtitleAsSecondary(tmpSub, filePath);
      }
    } catch (error) {
      console.error('[useLoadFiles] Failed to refresh subtitle after settings change:', error);
    }
  }, [createSubtitleContainer, loadSubtitleAsPrimary, loadSubtitleAsSecondary]);

  const prevToneTypeRef = useRef(toneType);
  const prevForceSimplifiedRef = useRef(primaryStyling.forceSimplified);
  useEffect(() => {
    const toneChanged = prevToneTypeRef.current !== toneType;
    const simplifiedChanged = prevForceSimplifiedRef.current !== primaryStyling.forceSimplified;
    prevToneTypeRef.current = toneType;
    prevForceSimplifiedRef.current = primaryStyling.forceSimplified;
    if (!toneChanged && !simplifiedChanged) return;

    const primaryPath = lastPrimarySubPath[0]?.path;
    const secondaryPath = lastSecondarySubPath[0]?.path;
    if (primaryPath) {
      reloadSubtitleWithoutPrompt(primaryPath, 'primary');
    }
    if (secondaryPath) {
      reloadSubtitleWithoutPrompt(secondaryPath, 'secondary');
    }
  }, [toneType, primaryStyling.forceSimplified, lastPrimarySubPath, lastSecondarySubPath, reloadSubtitleWithoutPrompt]);

  useEffect(() => {
    Line.removeHearingImpairedFlag = primaryStyling.removeHearingImpaired
  }, [primaryStyling.removeHearingImpaired])

  const loadVideoFile = useCallback((currentPath: string, pathUri: string) => {
    const source = buildVideoSource(currentPath, pathUri);
    console.log('[video-load] source created', {
      currentPath,
      pathUri,
      source
    });
    setVideoSrc(source);
    resetSub(setPrimarySub);
    resetSub(setSecondarySub);
  }, [resetSub, setPrimarySub, setSecondarySub]);

  const routeLoadedSubtitle = useCallback((tmpSub, loadedPath: string, currentPath: string, target?: SubtitleTarget) => {
    if (isYoutube(currentPath)) {
      console.log(`[useLoadFiles] YouTube video detected: ${currentPath}`);
      console.log('[useLoadFiles] Skipping auto-subtitle loading - user should select via modal');
      return;
    }

    const knownTarget = knownSubtitleTarget(currentPath, lang, videoConstants.englishLang, target);
    if (knownTarget) {
      console.log('[useLoadFiles] Loading subtitle file directly:', loadedPath, knownTarget);
      if (knownTarget === 'secondary') {
        loadSubtitleAsSecondary(tmpSub, currentPath);
      } else {
        loadSubtitleAsPrimary(tmpSub, currentPath);
      }
      return;
    }

    setPendingSubtitle(tmpSub);
    setPendingSubtitlePath(currentPath);
    setShowSubtitleModal(true);
    showToast('Choose subtitle type...');
  }, [lang, loadSubtitleAsPrimary, loadSubtitleAsSecondary, showToast]);

  const loadSubtitleFile = useCallback(async (currentPath: string, target?: SubtitleTarget) => {
    if (isYoutube(currentPath)) {
      console.log(`[useLoadFiles] YouTube video detected: ${currentPath}`);
      console.log('[useLoadFiles] Skipping auto-subtitle loading - user should select via modal');
      return;
    }

    showToast('Loading subtitle, please wait!');
    let toastSetter = null;

    try {
      console.log('[subtitle-load] loading external subtitle', {currentPath});
      toastSetter = setInterval(() => {
        showToast('Still loading subtitle, please wait!');
      }, TOAST_TIMEOUT);

      // A subtitle for a known slot is read the way that slot's last one was chosen to be.
      const options = (target && slotPreprocessOptions.current[target]) || DEFAULT_SUBTITLE_PREPROCESS_OPTIONS;
      const {tmpSub, subtitlePath} = await createSubtitleContainer(currentPath, options);
      routeLoadedSubtitle(tmpSub, subtitlePath, currentPath, target);
    } catch (error) {
      console.error('[useLoadFiles] Failed to load subtitle file:', error);
      showToast(`Failed to load subtitle: ${error.message}`);
    } finally {
      if (toastSetter) clearInterval(toastSetter);
    }
  }, [createSubtitleContainer, routeLoadedSubtitle, showToast]);

  const onLoadFiles = useCallback((acceptedFiles) => runSerially(async () => {
    try {
      const droppedPath = await acceptedFiles[0]?.path;
      if (!droppedPath) {
        console.error('[file-load] dropped file has no filesystem path', acceptedFiles[0]);
        showToast('Could not read the dropped file path');
        return;
      }

      const {currentPath, pathUri} = normalizeDroppedPath(droppedPath);
      console.log('[video-load] path normalized', {
        droppedPath,
        currentPath,
        pathUri,
        isVideo: isVideo(currentPath),
        isYoutube: isYoutube(currentPath)
      });
      if (isVideo(currentPath) || isYoutube(currentPath)) {
        loadVideoFile(currentPath, pathUri);
      }

      if (isYoutube(currentPath)) {
        await tryAutoLoadYoutubeLyrics(currentPath);
      } else if (isSubtitle(currentPath)) {
        await loadSubtitleFile(currentPath, acceptedFiles[0]?.target);
      }
    } catch (error) {
      console.error('[useLoadFiles] Error in file loading pipeline:', error);
      showToast(`Error: ${error.message}`);
    }
  }), [runSerially, loadVideoFile, loadSubtitleFile, tryAutoLoadYoutubeLyrics, showToast]);

  const loadPath = useCallback((lyricsPath) => {
    if (lyricsPath) {
      loadEmbeddedSubtitle(lyricsPath, 'primary');
    }
  }, [loadEmbeddedSubtitle]);

  /**
   * Loads the video `delta` files away in the same folder and moves each loaded subtitle the same
   * number of files along in its own folder; true if there was such a video. With none, nothing moves.
   */
  const onVideoChangeHandler = useCallback(async (delta: number = 1) => {
    if (!videoSrc.path || !isLocalPath(videoSrc.path)) return false;
    const nextVideo = await findPositionDeltaInFolder(videoSrc.path, delta);
    if (nextVideo === '') {
      setEnableSeeker(true);
      return false;
    }
    // Step from the file each subtitle was loaded from: the loaded one may be a sentence-case copy
    // in the temp folder, whose neighbours are unrelated files. Files Miteiru extracted to the temp
    // folder have no next episode beside them.
    // The next episode's subtitles go into the same slots, without asking again.
    const sources: [string, SubtitleTarget][] = [
      [primarySub.path, lastPrimarySubPath[0]?.path, 'primary'] as const,
      [secondarySub.path, lastSecondarySubPath[0]?.path, 'secondary'] as const
    ].filter(([loaded, source]) => loaded && source && !isMiteiruTempSubtitle(source))
      .map(([, source, target]) => [source, target]);
    await onLoadFiles([{path: nextVideo}]);
    for (const [source, target] of sources) {
      const nextSubtitle = await findPositionDeltaInFolder(source, delta);
      if (nextSubtitle !== '') await onLoadFiles([{path: nextSubtitle, target}]);
    }
    return true;
  }, [videoSrc.path, primarySub.path, secondarySub.path, lastPrimarySubPath, lastSecondarySubPath, onLoadFiles,
    setEnableSeeker]);

  useEffect(() => {
    if (player) {
      const enableSeeker = () => {
        console.log('[video-load] loadedmetadata', {
          currentSrc: player.currentSrc(),
          duration: player.duration()
        });
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

  // Reloading puts the subtitle back in its slot without asking.
  const reloadLastPrimarySubtitle = useCallback(() => {
    if (lastPrimarySubPath[0]?.path) {
      onLoadFiles([{path: lastPrimarySubPath[0].path, target: 'primary'}]);
    }
  }, [lastPrimarySubPath, onLoadFiles]);

  const reloadLastSecondarySubtitle = useCallback(() => {
    if (lastSecondarySubPath[0]?.path) {
      onLoadFiles([{path: lastSecondarySubPath[0].path, target: 'secondary'}]);
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
      // The pending subtitle was read with the default options; read it again only if they changed
      // (unticking the all-caps fix used to keep the sentence-case copy).
      const changed = Boolean(subtitlePreprocessOptions.titleCaseAllCaps) !==
        Boolean(DEFAULT_SUBTITLE_PREPROCESS_OPTIONS.titleCaseAllCaps);
      const tmpSub = changed
        ? (await createSubtitleContainer(pendingSubtitlePath, subtitlePreprocessOptions)).tmpSub
        : pendingSubtitle;
      if (target === 'primary') loadSubtitleAsPrimary(tmpSub, pendingSubtitlePath);
      else loadSubtitleAsSecondary(tmpSub, pendingSubtitlePath);
      slotPreprocessOptions.current[target] = subtitlePreprocessOptions;
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
