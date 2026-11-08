import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/router";
import {NativeVideo} from "../components/VideoPlayer/NativeVideo";
import {YouTubeVideo} from "../components/VideoPlayer/YouTubeVideo";
import MiteiruDropzone from "../components/VideoPlayer/MiteiruDropzone";
import MeaningBox from "../components/Meaning/MeaningBox";
import {VideoController} from "../components/VideoPlayer/VideoController";
import Toast from "../components/VideoPlayer/Toast";
import {Sidebar} from "../components/VideoPlayer/Sidebar";
import useKeyBind from "../hooks/useKeyBind";
import useSubtitle from "../hooks/useSubtitle";
import useLoadFiles from "../hooks/useLoadFiles";
import useMenuDisplay from "../hooks/useMenuDisplay";
import useReadyPlayerCallback from "../hooks/useReadyPlayerCallback";
import useMiteiruToast from "../hooks/useMiteiruToast";
import useMeaning from "../hooks/useMeaning";
import Head from "next/head";
import {getMiteiruAppName, getMiteiruVideoTitle, isLocalPath, isYoutube} from "../utils/utils";
import {setGlobalSubtitleId, SubtitleContainer} from "../components/Subtitle/DataStructures";
import {useStoreData} from "../hooks/useStoreData";
import {lookupPauseStep} from "../utils/lookupPause";
import {rightClickSaveMessage} from "../utils/vocabSaveLevels";
import VideoTopBar from "../components/VideoPlayer/VideoTopBar";
import ShortcutSheet, {useShortcutSheetKey} from "../components/VideoPlayer/ShortcutSheet";
import useLastVideo from "../hooks/useLastVideo";
import useSaveLastVideo from "../hooks/useSaveLastVideo";
import {useYoutubeTitle} from "../hooks/useYoutubeTitle";
import {
  useVideoKeyboardControls,
  useVideoPlayingToggle,
  useVideoTimeChanger
} from "../hooks/useVideoController";
import {usePlayNextAfterEnd} from "../hooks/usePlayNextAfterEnd";
import {useIdleControls} from "../hooks/useIdleControls";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import useLearningState from "../hooks/useLearningState";
import usePauseAndRepeat from "../hooks/usePauseAndRepeat";
import useTranslationLinks from "../hooks/useTranslationLinks";
import useContentString from "../hooks/useContentString";
import useVocabSidebar from "../hooks/useVocabSidebar";
import VocabSidebar from "../components/VideoPlayer/VocabSidebar";
import {RIGHT_SIDEBAR_WIDTH, VOCAB_SIDEBAR_WIDTH} from "../components/VideoPlayer/SidebarShell";
import useRubyCopy from "../hooks/useRubyCopy";
import {useSubtitleMode} from "../hooks/useSubtitleMode";
import {SubtitleDisplay} from "../components/Subtitle/SubtitleDisplay";
import LyricsSearchModal from "../components/Lyrics/LyricsSearchModal";
import SubtitleSelectionModal from "../components/Utils/SubtitleSelectionModal";
import MediaTrackSelectionModal from "../components/Utils/MediaTrackSelectionModal";
import AudioTrackModal from "../components/Utils/AudioTrackModal";
import CommandPalette from "../components/Utils/CommandPallete";
import useWordOfTheDay from "../hooks/useWordOfTheDay";
import WordOfTheDay from "../components/WordOfTheDay/WordOfTheDay";
import useMediaAnalysis from "../hooks/useMediaAnalysis";
import useLiveCaptions from "../hooks/useLiveCaptions";
import {LiveCaptionOverlay} from "../components/Subtitle/LiveCaptionOverlay";
import {LiveCaptionControl} from "../components/Subtitle/LiveCaptionControl";
import {useMediaTrackSubtitleSelection} from "../hooks/useMediaTrackSubtitleSelection";
import {getFileNameFromPath, loadMediaPaths} from "../utils/mediaUtils";
import PlaybackFailedPanel from "../components/VideoPlayer/PlaybackFailedPanel";
import {analysisFailureMessage} from "../utils/toolSetup";
import {useYoutubeTranscription} from '../hooks/useYoutubeTranscription';
import {useSubtitleForecast} from '../hooks/useSubtitleForecast';
import {useUserDictionary} from '../hooks/useUserDictionary';
import {useSubtitleRetokenization} from '../hooks/useSubtitleRetokenization';
import {YoutubeTranscriptionControl} from '../components/VideoPlayer/YoutubeTranscriptionControl';
import {UserDictionaryPanel} from '../components/VideoPlayer/UserDictionaryPanel';
import {BoxTipsOverlay} from '../components/VideoPlayer/BoxTipsOverlay';

function Video() {
  const {
    contentString,
    setExternalContent
  } = useContentString();
  const {
    subtitleMode,
    setSubtitleMode
  } = useSubtitleMode();
  const {
    tokenizerMode,
    tokenizerModeLoaded,
    tokenizeMiteiru,
    lang,
    toneType,
    setToneType
  } = useMiteiruTokenizer();
  const {
    openDeepL,
    openGoogleTranslate
  } = useTranslationLinks(contentString, lang);
  const {
    toastInfo,
    setToastInfo
  } = useMiteiruToast();
  const {
    readyCallback,
    metadata,
    player,
    clock
  } = useReadyPlayerCallback();

  const {
    showVocabSidebar,
    setShowVocabSidebar,
  } = useVocabSidebar();

  const {
    primarySub,
    setPrimarySub,
    secondarySub,
    setSecondarySub,
    primaryShift,
    setPrimaryShift,
    secondaryShift,
    setSecondaryShift,
    primaryStyling,
    setPrimaryStyling,
    secondaryStyling,
    setSecondaryStyling,
    showPrimarySub,
    setShowPrimarySub,
    showSecondarySub,
    setShowSecondarySub,
    primaryTimeCache,
    setPrimaryTimeCache,
    secondaryTimeCache,
    setSecondaryTimeCache
  } = useSubtitle();
  const {
    getLearningStateClass,
    changeLearningState,
    setLearningLevel,
    setFrequencyPrimary,
    learningPercentage,
    setLearningPercentage,
    getLearningState,
    refreshTrigger,
    savedWords,
  } = useLearningState(lang);
  const {
    dailyWords,
    isLoading: isDailyWordsLoading,
    dateString,
    generateDailyWords
  } = useWordOfTheDay(lang, savedWords);
  // Right-click on a subtitle word changes its level; say what it did, since only its colour changes.
  const saveWordByRightClick = useCallback((content: string) => {
    const level = changeLearningState(content);
    if (level !== undefined) setToastInfo({message: rightClickSaveMessage(content, level), update: String(Date.now())});
  }, [changeLearningState, setToastInfo]);
  // Removing the primary subtitle (Subtitles… menu) also clears its word frequencies.
  const primaryCleared = primarySub.lines.length === 0;
  useEffect(() => {
    if (primaryCleared) setFrequencyPrimary(new Map());
  }, [primaryCleared, setFrequencyPrimary]);
  const {
    meaning,
    setMeaning,
    undo,
    canGoBack
  } = useMeaning();
  const [pauseOnLookup, setPauseOnLookup] = useStoreData('video.pauseOnLookup', true);
  const {
    duration,
    deltaTime,
    changeTimeTo,
    enableSeeker,
    setEnableSeeker
  } = useVideoTimeChanger(player, clock, metadata);
  const {
    videoSrc,
    onLoadFiles,
    continueVideo,
    onVideoChangeHandler,
    reloadLastPrimarySubtitle,
    reloadLastSecondarySubtitle,
    loadPath,
    showSubtitleModal,
    pendingSubtitlePath,
    currentAppLanguage,
    handleSelectPrimary,
    handleSelectSecondary,
    handleCloseModal,
    subtitlePreprocessOptions,
    setSubtitlePreprocessOptions,
    loadEmbeddedSubtitle
  } = useLoadFiles(setToastInfo,
      primarySub, setPrimarySub,
      secondarySub, setSecondarySub,
      primaryStyling,
      tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang, setFrequencyPrimary,
      toneType, setPrimaryTimeCache);
  const generatedAhead = useYoutubeTranscription({
    videoPath: videoSrc.path, openedVideo: videoSrc, lang, clock, player, primarySub, setPrimarySub,
    tokenizeMiteiru, forceSimplified: primaryStyling.forceSimplified, setFrequencyPrimary
  });
  const forecast = useSubtitleForecast({subtitle: primarySub, lang, clock, videoPath: videoSrc.path, shiftMs: primaryShift});
  const userDictionary = useUserDictionary(lang);
  useSubtitleRetokenization({subtitle: primarySub, enabled: forecast.dictionaryEnabled, aiRetokenizations: forecast.retokenizations, tokenizeMiteiru, clock, setFrequencyPrimary});
  const [showDictionary, setShowDictionary] = useState(false);
  const {
    showController,
    setShowController,
    showSidebar,
    setShowSidebar,
    showLyricsSearch,
    setShowLyricsSearch,
    showCommandPalette,
    setShowCommandPalette
  } = useMenuDisplay();
  // The top bar opens Settings straight on the AI tab; a new nonce makes the sidebar switch tab again.
  const [settingsRequest, setSettingsRequest] = useState<{tab: 'ai'; nonce: number}>();
  const openAiSettings = useCallback(() => {
    setSettingsRequest((old) => ({tab: 'ai', nonce: (old?.nonce ?? 0) + 1}));
    setShowSidebar(true);
  }, [setShowSidebar]);

  const [rubyContent, setRubyCopyContent] = useRubyCopy();
  const {
    togglePlay,
    isPlaying,
    setIsPlaying
  } = useVideoPlayingToggle(player, metadata);

  const {
    mediaInfo,
    showTrackSelectionModal,
    showAudioTrackModal,
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    openTrackSelectionModal,
    handleAudioTrackSkip,
    handleAudioTrackSelect,
    openAudioTrackModal,
    audioPickerReason,
    playingAudioIndex
  } = useMediaAnalysis(videoSrc.path, videoSrc);
  const liveCaptions = useLiveCaptions();
  const visibleLiveCaption = liveCaptions.caption.trim();
  const hasVideo = Boolean(videoSrc.path && videoSrc.path !== '');
  const showPrimarySubtitle = useMemo(
      () => showPrimarySub && visibleLiveCaption.length === 0,
      [showPrimarySub, visibleLiveCaption]
  );
  const videoOptions = useMemo(() => ({
    muted: typeof window !== 'undefined' && window.__MITEIRU_START_MUTED__ === true,
    techOrder: ["html5", "youtube"],
    sources: [videoSrc],
    youtube: {
      customVars: {
        cc_load_policy: 0,
        autoplay: 1,
        loop: 0,
        disablekb: 1,
        controls: 0,
        playsinline: 1,
        rel: 0,
        modestbranding: 1
      }
    },
    responsive: true,
    playbackRates: [0.5, 1, 1.5, 2],
    controlBar: {
      liveDisplay: false,
      pictureInPictureToggle: false,
      remainingTimeDisplay: true,
      playbackRateMenuButton: false,
      durationDisplay: true
    }
  }), [videoSrc]);

  const handleMediaTrackSelection = useMediaTrackSubtitleSelection({
    videoPath: videoSrc.path,
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    loadEmbeddedSubtitle,
    setToastInfo,
    languageName: currentAppLanguage
  });
  const pendingSubtitleFileName = useMemo(
      () => getFileNameFromPath(pendingSubtitlePath),
      [pendingSubtitlePath]
  );
  // A YouTube video goes by its title, not the end of its link (watch?v=…).
  const youtubeTitle = useYoutubeTitle(videoSrc.path);
  const mediaFileName = useMemo(
      () => youtubeTitle ?? (isYoutube(videoSrc.path) ? 'YouTube video' : getFileNameFromPath(videoSrc.path)),
      [videoSrc.path, youtubeTitle]
  );
  const mediaVideoUrl = useMemo(
      () => isYoutube(videoSrc.path) ? videoSrc.path : undefined,
      [videoSrc.path]
  );
  // A failed AI batch pauses the tools until Retry, so say so where the learner is looking.
  const retryForecast = useRef(forecast.retry);
  retryForecast.current = forecast.retry;
  useEffect(() => {
    if (!forecast.error) return;
    setToastInfo({
      message: `AI study tools paused: ${forecast.error}`,
      update: String(Date.now()),
      action: {label: 'Retry', onPress: () => retryForecast.current()}
    });
  }, [forecast.error, setToastInfo]);
  useEffect(() => {
    if (!mediaVideoUrl) return;
    setToastInfo({
      message: 'YouTube captions load in the background.',
      update: String(Date.now()),
      action: {label: 'Choose subtitles', onPress: openTrackSelectionModal}
    });
  }, [mediaVideoUrl, openTrackSelectionModal, setToastInfo]);
  const {
    autoPause,
    setAutoPause,
    backToHead
  } = usePauseAndRepeat(primaryTimeCache, clock, primaryShift, setIsPlaying, changeTimeTo);

  const router = useRouter();
  const goHome = useCallback(() => router.push('/home'), [router]);
  const openFiles = useCallback(async () => {
    try {
      await loadMediaPaths(await window.electronAPI.pickMediaFiles(), onLoadFiles, lang);
    } catch (error) {
      console.error('[video] opening files failed', error);
      setToastInfo({message: `Could not open the files: ${error.message}`, update: String(Date.now())});
    }
  }, [onLoadFiles, setToastInfo, lang]);

  // A short message for the settings panel (imports, styles).
  const notify = useCallback((message: string) => {
    setToastInfo({message, update: String(Date.now())});
  }, [setToastInfo]);

  // The tracks inside the video could not be read (no FFmpeg, usually): say so, and offer a subtitle file.
  // Once per analysis: a ref keeps the toast from coming back whenever the open function is rebuilt.
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  useEffect(() => {
    if (!mediaInfo.error) return;
    setToastInfo({
      message: analysisFailureMessage(mediaInfo.error),
      update: String(Date.now()),
      action: {label: 'Open a subtitle file', onPress: () => openFilesRef.current()}
    });
  }, [mediaInfo, setToastInfo]);

  // "Open a subtitle file instead…" in the subtitle picker: close it, then pick.
  const openSubtitleFileInstead = useCallback(() => {
    handleCloseTrackSelectionModal();
    openFiles();
  }, [handleCloseTrackSelectionModal, openFiles]);

  // mpv could not play this local file: a panel instead of a black screen. The reason is set when the
  // player itself couldn't start (no libmpv, for one), which no other file would fix either.
  const [failedPath, setFailedPath] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const playbackFailed = hasVideo && failedPath === videoSrc.path;
  // Opening a file again (the same one too) is a retry: its earlier failure no longer stands.
  useEffect(() => {
    setFailedPath('');
  }, [videoSrc]);

  const commands = useKeyBind(setMeaning, setShowController, setShowSidebar, undo,
      setShowPrimarySub, setShowSecondarySub, primaryStyling, setPrimaryStyling,
      openDeepL, openGoogleTranslate, reloadLastPrimarySubtitle, reloadLastSecondarySubtitle,
      setShowVocabSidebar, rubyContent, contentString, setShowLyricsSearch, openFiles, currentAppLanguage);
  useVideoKeyboardControls(togglePlay, deltaTime, setPrimaryShift, setSecondaryShift,
      setToastInfo, backToHead, setIsPlaying, currentAppLanguage);
  usePlayNextAfterEnd(player, onVideoChangeHandler, setEnableSeeker, setIsPlaying);


  // Subtitles sit between the open side panels rather than under them (Subtitle reads these).
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--subtitle-inset-left', showVocabSidebar ? VOCAB_SIDEBAR_WIDTH : '0px');
    root.setProperty('--subtitle-inset-right', showSidebar ? RIGHT_SIDEBAR_WIDTH : '0px');
  }, [showSidebar, showVocabSidebar]);
  useEffect(() => () => {
    document.documentElement.style.removeProperty('--subtitle-inset-left');
    document.documentElement.style.removeProperty('--subtitle-inset-right');
  }, []);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const toggleShortcuts = useCallback(() => setShowShortcuts(old => !old), []);
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);
  useShortcutSheetKey(toggleShortcuts);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  // While a video plays, the controls fade out when the mouse rests; not while a panel or dialog is open.
  const panelOpen = showSidebar || showVocabSidebar || showCommandPalette || meaning !== '' ||
      showSubtitleModal || showLyricsSearch || showTrackSelectionModal || showAudioTrackModal ||
      showShortcuts || showSubtitleMenu || showDictionary || generatedAhead.isOpen;
  const {controlsRef} = useIdleControls<HTMLDivElement>(hasVideo && Boolean(isPlaying), !panelOpen);

  // Looking up a word pauses the video, and closing the popup resumes it, but only if Miteiru paused it.
  const lookupState = useRef({wasOpen: false, pausedByUs: false});
  const lookupOpen = meaning !== '';
  useEffect(() => {
    const step = lookupPauseStep({
      open: lookupOpen,
      wasOpen: lookupState.current.wasOpen,
      playing: hasVideo && Boolean(isPlaying),
      enabled: pauseOnLookup,
      pausedByUs: lookupState.current.pausedByUs
    });
    lookupState.current = {wasOpen: lookupOpen, pausedByUs: step.pausedByUs};
    if (step.pause) setIsPlaying(0);
    if (step.resume) setIsPlaying(1);
  }, [lookupOpen, hasVideo, isPlaying, pauseOnLookup, setIsPlaying]);

  // Local track choices pause the file. YouTube captions can be chosen while it keeps playing.
  useEffect(() => {
    if ((showTrackSelectionModal && !isYoutube(videoSrc.path)) || showAudioTrackModal) {
      setIsPlaying(0);
    }
  }, [showTrackSelectionModal, showAudioTrackModal, videoSrc.path, setIsPlaying]);

  // Once, when the first subtitle line shows: how to look a word up and how to save it.
  const [wordHintShown, setWordHintShown, wordHintLoaded] = useStoreData('hint.wordLookupShown', false);
  useEffect(() => {
    if (!wordHintLoaded || wordHintShown || !contentString) return;
    setWordHintShown(true);
    setToastInfo({
      message: 'Click a word to look it up · Right-click to save it',
      update: String(Date.now()),
      duration: 9000
    });
  }, [wordHintLoaded, wordHintShown, contentString, setWordHintShown, setToastInfo]);

  // Removing a subtitle can be undone from the toast that says it happened.
  const removeSubtitle = useCallback((slot: 'primary' | 'secondary') => {
    const toast = (message: string, restore: () => void) => setToastInfo({
      message,
      update: String(Date.now()),
      action: {label: 'Undo', onPress: restore}
    });
    if (slot === 'primary') {
      const removed = primarySub;
      const empty = new SubtitleContainer('');
      setPrimarySub(empty);
      setGlobalSubtitleId(empty.id);
      toast(`Removed the ${currentAppLanguage} subtitle`, () => {
        setPrimarySub(removed);
        setGlobalSubtitleId(removed.id);
        setFrequencyPrimary(removed.frequency);
      });
    } else {
      const removed = secondarySub;
      setSecondarySub(new SubtitleContainer(''));
      toast('Removed the translation', () => setSecondarySub(removed));
    }
  }, [primarySub, secondarySub, setPrimarySub, setSecondarySub, setFrequencyPrimary, setToastInfo, currentAppLanguage]);
  const removePrimarySubtitle = useCallback(() => removeSubtitle('primary'), [removeSubtitle]);
  const removeSecondarySubtitle = useCallback(() => removeSubtitle('secondary'), [removeSubtitle]);

  // Continue watching: the last video is saved while this page is open, and offered on the Watch page.
  const {last: lastVideo, loaded: lastVideoLoaded} = useLastVideo();
  // The path whose own playback has started. Comparing paths (not a flag reset in an effect) means the
  // render right after a path change already counts as "not started", while the clock still holds the
  // previous video's time.
  const [startedPath, setStartedPath] = useState('');
  useEffect(() => {
    if (metadata > 0) setStartedPath(videoSrc.path);
    // Only a new load of metadata marks the current path as started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata]);
  const videoStarted = startedPath === videoSrc.path;
  useSaveLastVideo({
    path: videoSrc.path,
    title: mediaFileName,
    primarySubtitle: primarySub.path,
    secondarySubtitle: secondarySub.path,
    clock,
    durationMs: duration,
    playing: hasVideo && Boolean(isPlaying),
    started: videoStarted
  });
  const continueLastVideo = useCallback(() => {
    if (lastVideo) continueVideo(lastVideo);
  }, [lastVideo, continueVideo]);
  // "Continue" on Home, and "Back to Video" on Study a text, arrive here as /video?continue=1.
  const continueHandled = useRef(false);
  const continueRequested = router.isReady && router.query.continue === '1';
  useEffect(() => {
    if (!continueRequested || !lastVideoLoaded || tokenizerMode === '' || lang === '' || continueHandled.current) return;
    continueHandled.current = true;
    router.replace('/video', undefined, {shallow: true});
    if (lastVideo && !hasVideo) continueVideo(lastVideo);
  }, [continueRequested, lastVideoLoaded, lastVideo, tokenizerMode, lang, hasVideo, continueVideo, router]);

  return (
      <React.Fragment>
        <Head>
          <title>{hasVideo
              ? getMiteiruVideoTitle(videoSrc.path, primarySub.path, secondarySub.path, youtubeTitle ?? undefined)
              : `${getMiteiruAppName()} - Watch`}</title>
        </Head>
        <div>
          <Toast info={toastInfo}/>
          {hasVideo && <VideoTopBar
              onHome={goHome}
              onOpenFiles={openFiles}
              onShowMyWords={() => setShowVocabSidebar(old => !old)}
              onShowShortcuts={toggleShortcuts}
              subtitleMenuOpen={showSubtitleMenu}
              setSubtitleMenuOpen={setShowSubtitleMenu}
              canChooseTracks={mediaInfo.subtitleTracks.length > 0 || isYoutube(videoSrc.path)}
              isYoutube={isYoutube(videoSrc.path)}
              onChooseTracks={openTrackSelectionModal}
              canChooseAudio={mediaInfo.audioTracks.length > 1 && !isYoutube(videoSrc.path)}
              onChooseAudio={openAudioTrackModal}
              languageName={currentAppLanguage}
              hasPrimarySubtitle={primarySub.lines.length > 0}
              hasSecondarySubtitle={secondarySub.lines.length > 0}
              onRemovePrimary={removePrimarySubtitle}
              onRemoveSecondary={removeSecondarySubtitle}
              onOpenAiSettings={openAiSettings}
              aiActive={forecast.tipsEnabled || forecast.dictionaryEnabled || generatedAhead.enabled}
              onGenerateAhead={isYoutube(videoSrc.path) ? generatedAhead.open : undefined}
              learningStyleEnabled={Boolean(primaryStyling.learning)}
              onLearningStyleChange={(enabled) => setPrimaryStyling({...primaryStyling, learning: enabled})}/>}
          <BoxTipsOverlay key={videoSrc.path} tips={forecast.tips} clock={clock} enabled={forecast.tipsEnabled} shiftMs={primaryShift}/>
          <MeaningBox meaning={meaning} setMeaning={setMeaning} tokenizeMiteiru={tokenizeMiteiru}
                      lang={lang} setLearningLevel={setLearningLevel}
                      getLearningState={getLearningState}
                      onBack={canGoBack ? undo : null}
                      showCloseButton
                      sentenceCopyKey="C"
                      sidebarInsets={{
                        left: showVocabSidebar ? VOCAB_SIDEBAR_WIDTH : "0",
                        right: showSidebar ? RIGHT_SIDEBAR_WIDTH : "0",
                      }}/>

          {!hasVideo && !isDailyWordsLoading && (
            <WordOfTheDay
                dailyWords={dailyWords}
                dateString={dateString}
                lang={lang}
                setMeaning={setMeaning}
                tokenizeMiteiru={tokenizeMiteiru}
                onRefresh={generateDailyWords}
                onOpenFiles={openFiles}
                onHome={goHome}
                lastVideo={lastVideo}
                onContinue={continueLastVideo}
            />
          )}

          {!hasVideo && isDailyWordsLoading && (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
              <div className="text-center p-8 bg-white rounded-xl shadow-lg border-2 border-blue-200">
                <div className="text-6xl mb-4">⏳</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Word of the Day...</h2>
                <p className="text-gray-600">{dateString}</p>
              </div>
            </div>
          )}

          {hasVideo && (
            // Local files play in libmpv. YouTube does too when yt-dlp finds its streams, and in the
            // YouTube embed otherwise.
            videoSrc.type === 'video/youtube'
                ? <YouTubeVideo options={videoOptions} onReady={readyCallback} clock={clock}/>
                : <NativeVideo options={videoOptions} onReady={readyCallback} clock={clock}
                               onError={(_seconds, reason) => {
                                 setFailedPath(videoSrc.path);
                                 setFailureReason(reason ?? '');
                               }}/>
          )}
          {playbackFailed && <PlaybackFailedPanel fileName={mediaFileName} reason={failureReason} onTryAnother={openFiles}/>}

          <div>
            <SubtitleDisplay
                // Primary subtitle props
                showPrimarySub={showPrimarySubtitle}
                setMeaning={setMeaning}
                clock={clock}
                primarySub={primarySub}
                primaryShift={primaryShift}
                primaryStyling={primaryStyling}
                getLearningStateClass={getLearningStateClass}
                changeLearningState={saveWordByRightClick}
                primaryTimeCache={primaryTimeCache}
                setPrimaryTimeCache={setPrimaryTimeCache}
                setExternalContent={setExternalContent}
                setRubyCopyContent={setRubyCopyContent}

                // Secondary subtitle props
                showSecondarySub={showSecondarySub}
                secondarySub={secondarySub}
                secondaryShift={secondaryShift}
                secondaryStyling={secondaryStyling}
                secondaryTimeCache={secondaryTimeCache}
                setSecondaryTimeCache={setSecondaryTimeCache}

                // Mode
                subtitleMode={subtitleMode}
            />
            <LiveCaptionOverlay
                caption={liveCaptions.caption}
                subtitleStyling={primaryStyling}
                lang={lang}
                tokenizeMiteiru={tokenizeMiteiru}
                setMeaning={setMeaning}
                getLearningStateClass={getLearningStateClass}
                changeLearningState={saveWordByRightClick}
                setExternalContent={setExternalContent}
                setRubyCopyContent={setRubyCopyContent}
            />
          </div>
          <LiveCaptionControl
              className="autohide"
              supported={liveCaptions.supported}
              running={liveCaptions.running}
              starting={liveCaptions.starting}
              state={liveCaptions.state}
              error={liveCaptions.error}
              debugMessages={liveCaptions.debugMessages}
              refreshIntervalMs={liveCaptions.refreshIntervalMs}
              onRefreshIntervalChange={liveCaptions.setRefreshIntervalMs}
              onToggle={liveCaptions.toggle}
          />
          <div className={"autohide flex flex-col justify-end bottom-0 z-[15] fixed"} ref={controlsRef}>
            {hasVideo && player && <VideoController
                isPlaying={isPlaying}
                duration={duration}
                changeTimeTo={changeTimeTo}
                deltaTime={deltaTime}
                togglePlay={togglePlay}
                player={player}
                clock={clock}
                showController={showController}
                setShowSidebar={setShowSidebar}
                enableSeeker={enableSeeker}
                setEnableSeeker={setEnableSeeker}
                onVideoChangeHandler={onVideoChangeHandler}
                canStepVideos={isLocalPath(videoSrc.path) && !isYoutube(videoSrc.path)}
                backToHead={backToHead}
                primaryLines={primarySub.lines}
                tipRanges={forecast.tipsEnabled ? forecast.tips : undefined}
                primaryShift={primaryShift}/>}
          </div>
          {tokenizerMode !== '' && <MiteiruDropzone onDrop={onLoadFiles} deltaTime={deltaTime} lang={lang}/>}
        </div>

        <LyricsSearchModal
            isOpen={showLyricsSearch}
            onClose={() => setShowLyricsSearch(false)}
            videoSrc={videoSrc}
            onLyricsDownloaded={loadPath}
        />
        <SubtitleSelectionModal
            isOpen={showSubtitleModal}
            onClose={handleCloseModal}
            onSelectPrimary={handleSelectPrimary}
            onSelectSecondary={handleSelectSecondary}
            fileName={pendingSubtitleFileName}
            currentAppLanguage={currentAppLanguage}
            preprocessOptions={subtitlePreprocessOptions}
            onPreprocessOptionsChange={setSubtitlePreprocessOptions}
        />
        <UserDictionaryPanel isOpen={showDictionary} onClose={() => setShowDictionary(false)} dictionary={userDictionary}
          languageName={currentAppLanguage}/>
        <YoutubeTranscriptionControl isOpen={generatedAhead.isOpen} onClose={generatedAhead.close}
          onStart={() => {setShowPrimarySub(true); generatedAhead.start();}} onStop={generatedAhead.stop} onRetry={generatedAhead.retry}
          enabled={generatedAhead.enabled} state={generatedAhead.state} hasApiKey={generatedAhead.hasApiKey}
          asrModel={generatedAhead.asrModel} setAsrModel={generatedAhead.setAsrModel} asrModelOptions={generatedAhead.asrModelOptions}/>
        <MediaTrackSelectionModal
            isOpen={showTrackSelectionModal}
            onClose={handleCloseTrackSelectionModal}
            onConfirm={handleMediaTrackSelection}
            fileName={mediaFileName}
            subtitleTracks={mediaInfo.subtitleTracks}
            currentAppLanguage={currentAppLanguage}
            appLanguageCode={lang}
            videoUrl={mediaVideoUrl}
            onOpenSubtitleFile={openSubtitleFileInstead}
        />
        <AudioTrackModal
            isOpen={showAudioTrackModal}
            onClose={handleAudioTrackSkip}
            onSelect={handleAudioTrackSelect}
            fileName={mediaFileName}
            audioTracks={mediaInfo.audioTracks}
            appLanguageCode={lang}
            mode={audioPickerReason}
            currentIndex={playingAudioIndex}
        />
        <CommandPalette
            showCommandPalette={showCommandPalette}
            setShowCommandPalette={setShowCommandPalette}
            commands={commands}
        />
        <Sidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar}
                 primarySub={primarySub}
                 primaryStyling={primaryStyling}
                 setPrimaryStyling={setPrimaryStyling}
                 secondaryStyling={secondaryStyling}
                 setSecondaryStyling={setSecondaryStyling}
                 autoPause={autoPause}
                 setAutoPause={setAutoPause}
                 learningPercentage={learningPercentage}
                 setLearningPercentage={setLearningPercentage} lang={lang} toneType={toneType}
                 tokenizeMiteiru={tokenizeMiteiru}
                 setToneType={setToneType} subtitleMode={subtitleMode}
                 setSubtitleMode={setSubtitleMode}
                 setShowLyricsSearch={setShowLyricsSearch}
                 pauseOnLookup={pauseOnLookup}
                 setPauseOnLookup={setPauseOnLookup}
                 secondarySub={secondarySub}
                 primaryShift={primaryShift} setPrimaryShift={setPrimaryShift}
                 secondaryShift={secondaryShift} setSecondaryShift={setSecondaryShift}
                 languageName={currentAppLanguage}
                 notify={notify}
                 requestedTab={settingsRequest}
                 forecast={forecast}
                 dictionaryCount={userDictionary.entries.length}
                 onOpenDictionary={() => setShowDictionary(true)}/>
        <ShortcutSheet isOpen={showShortcuts} onClose={closeShortcuts} languageName={currentAppLanguage}/>
        <VocabSidebar
            showVocabSidebar={showVocabSidebar}
            setShowVocabSidebar={setShowVocabSidebar}
            lang={lang}
            setMeaning={setMeaning}
            tokenizeMiteiru={tokenizeMiteiru}
            refreshTrigger={refreshTrigger}
            languageLoaded={tokenizerModeLoaded}
        />
      </React.Fragment>
  );
}

export default Video
