import React, {useCallback, useEffect, useMemo} from "react";
import VideoJS from "../components/VideoPlayer/VideoJS";
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
import {getMiteiruVideoTitle} from "../utils/utils";
import {
  useVideoKeyboardControls,
  useVideoPlayingToggle,
  useVideoTimeChanger
} from "../hooks/useVideoController";
import {usePlayNextAfterEnd} from "../hooks/usePlayNextAfterEnd";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import 'react-awesome-button/dist/styles.css';
import useLearningState from "../hooks/useLearningState";
import usePauseAndRepeat from "../hooks/usePauseAndRepeat";
import useTranslationLinks from "../hooks/useTranslationLinks";
import useContentString from "../hooks/useContentString";
import useVocabSidebar from "../hooks/useVocabSidebar";
import VocabSidebar from "../components/VideoPlayer/VocabSidebar";
import useRubyCopy from "../hooks/useRubyCopy";
import usePitchValue from "../hooks/usePitchValue";
import {useSubtitleMode} from "../hooks/useSubtitleMode";
import {SubtitleDisplay} from "../components/Subtitle/SubtitleDisplay";
import LyricsSearchModal from "../components/Lyrics/LyricsSearchModal";
import SubtitleSelectionModal from "../components/Utils/SubtitleSelectionModal";
import MediaTrackSelectionModal from "../components/Utils/MediaTrackSelectionModal";
import AudioReencodeModal from "../components/Utils/AudioReencodeModal";
import ReencodeProgressModal from "../components/Utils/ReencodeProgressModal";
import CommandPalette from "../components/Utils/CommandPallete";
import useWordOfTheDay from "../hooks/useWordOfTheDay";
import WordOfTheDay from "../components/WordOfTheDay/WordOfTheDay";
import useMediaAnalysis from "../hooks/useMediaAnalysis";
import useLiveCaptions from "../hooks/useLiveCaptions";
import {LiveCaptionOverlay} from "../components/Subtitle/LiveCaptionOverlay";
import {LiveCaptionControl} from "../components/Subtitle/LiveCaptionControl";
import {useMediaTrackSubtitleSelection} from "../hooks/useMediaTrackSubtitleSelection";
import {getFileNameFromPath} from "../utils/mediaUtils";

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
    pitchValue,
    setPitchValue
  } = usePitchValue();
  const {
    tokenizerMode,
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
    currentTime,
    setCurrentTime
  } = useReadyPlayerCallback();

  const {
    showVocabSidebar,
    setShowVocabSidebar,
  } = useVocabSidebar();

  const {
    dailyWords,
    isLoading: isDailyWordsLoading,
    dateString,
    generateDailyWords
  } = useWordOfTheDay(lang);

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
    setFrequencyPrimary,
    learningPercentage,
    setLearningPercentage,
    getLearningState,
    refreshTrigger,
  } = useLearningState(lang);
  const {
    meaning,
    setMeaning,
    undo
  } = useMeaning();
  const {
    duration,
    deltaTime,
    changeTimeTo,
    enableSeeker,
    setEnableSeeker
  } = useVideoTimeChanger(player, setCurrentTime, metadata);
  const {
    videoSrc,
    onLoadFiles,
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
      tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang, setFrequencyPrimary);
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

  const [rubyContent, setRubyCopyContent] = useRubyCopy();
  const {
    togglePlay,
    isPlaying,
    setIsPlaying
  } = useVideoPlayingToggle(player, metadata);

  const {
    mediaInfo,
    showTrackSelectionModal,
    showAudioReencodeModal,
    showReencodeProgress,
    reencodeProgress,
    selectedAudioForRencode,
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    handleCloseAudioReencodeModal,
    handleAudioReencodeConfirm,
    handleAudioReencodeSkip
  } = useMediaAnalysis(videoSrc.path);
  const liveCaptions = useLiveCaptions();
  const visibleLiveCaption = liveCaptions.caption.trim();
  const showPrimarySubtitle = useMemo(
      () => showPrimarySub && visibleLiveCaption.length === 0,
      [showPrimarySub, visibleLiveCaption]
  );
  const videoOptions = useMemo(() => ({
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

  // Handle loading processed video with selected audio
  const handleReencodedVideoLoad = useCallback((videoPath: string) => {
    // Load the processed video file
    onLoadFiles([{path: videoPath}]);
  }, [onLoadFiles]);

  const handleMediaTrackSelection = useMediaTrackSubtitleSelection({
    videoPath: videoSrc.path,
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    loadEmbeddedSubtitle,
    setToastInfo
  });
  const pendingSubtitleFileName = useMemo(
      () => getFileNameFromPath(pendingSubtitlePath),
      [pendingSubtitlePath]
  );
  const mediaFileName = useMemo(
      () => getFileNameFromPath(videoSrc.path),
      [videoSrc.path]
  );
  const mediaVideoUrl = useMemo(
      () => videoSrc.path.startsWith('http') ? videoSrc.path : undefined,
      [videoSrc.path]
  );
  const selectedAudioTrackLabel = useMemo(
      () => selectedAudioForRencode
        ? `${selectedAudioForRencode.title || selectedAudioForRencode.language || 'Track'} (${selectedAudioForRencode.codec})`
        : '',
      [selectedAudioForRencode]
  );
  const handleAudioReencodeModalConfirm = useCallback((trackIndex, convertToX264, convertAudioToAac) => {
    handleAudioReencodeConfirm(trackIndex, handleReencodedVideoLoad, convertToX264, convertAudioToAac);
  }, [handleAudioReencodeConfirm, handleReencodedVideoLoad]);

  const {
    autoPause,
    setAutoPause,
    backToHead
  } = usePauseAndRepeat(primaryTimeCache, player, currentTime, primaryShift, setIsPlaying, changeTimeTo);

  const commands = useKeyBind(setMeaning, setShowController, setShowSidebar,
      setPrimarySub, setSecondarySub, primarySub, undo,
      setShowPrimarySub, setShowSecondarySub, primaryStyling, setPrimaryStyling,
      openDeepL, openGoogleTranslate, reloadLastPrimarySubtitle, reloadLastSecondarySubtitle,
      setShowVocabSidebar, rubyContent, contentString, setShowLyricsSearch);
  useVideoKeyboardControls(togglePlay, deltaTime, setPrimaryShift, setSecondaryShift,
      setToastInfo, backToHead, setIsPlaying);
  usePlayNextAfterEnd(player, currentTime, onVideoChangeHandler, duration, setEnableSeeker);

  // Pause player when media selection modals open
  useEffect(() => {
    if (showTrackSelectionModal || showAudioReencodeModal) {
      setIsPlaying(0);
    }
  }, [showTrackSelectionModal, showAudioReencodeModal, setIsPlaying]);

  // Show Word of the Day when no media is loaded
  if (!videoSrc.path || videoSrc.path === '') {
    return (
      <React.Fragment>
        <Head>
          <title>Miteiru - Word of the Day</title>
        </Head>
        <div>
          <Toast info={toastInfo}/>
          <MeaningBox meaning={meaning} setMeaning={setMeaning} tokenizeMiteiru={tokenizeMiteiru}
                      lang={lang} changeLearningState={changeLearningState}
                      getLearningState={getLearningState}/>
          
          {!isDailyWordsLoading && (
            <WordOfTheDay
              dailyWords={dailyWords}
              dateString={dateString}
              lang={lang}
              setMeaning={setMeaning}
              tokenizeMiteiru={tokenizeMiteiru}
              onRefresh={generateDailyWords}
            />
          )}
          
          {isDailyWordsLoading && (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
              <div className="text-center p-8 bg-white rounded-xl shadow-lg border-2 border-blue-200">
                <div className="text-6xl mb-4">⏳</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Word of the Day...</h2>
                <p className="text-gray-600">{dateString}</p>
              </div>
            </div>
          )}

          {/* Show dropzone for loading media */}
          {tokenizerMode !== '' && <MiteiruDropzone onDrop={onLoadFiles} deltaTime={deltaTime}/>}
        </div>
      </React.Fragment>
    );
  }

  // Regular video interface when media is loaded
  return (
      <React.Fragment>
        <Head>
          <title>{getMiteiruVideoTitle(videoSrc.path, primarySub.path, secondarySub.path, showPrimarySub, showSecondarySub)}</title>
        </Head>
        <div>
          <Toast info={toastInfo}/>
          <MeaningBox meaning={meaning} setMeaning={setMeaning} tokenizeMiteiru={tokenizeMiteiru}
                      lang={lang} changeLearningState={changeLearningState}
                      getLearningState={getLearningState}/>
          <VideoJS options={videoOptions} onReady={readyCallback} setCurrentTime={setCurrentTime} pitchValue={pitchValue}/>
          <div>
            <SubtitleDisplay
                // Primary subtitle props
                showPrimarySub={showPrimarySubtitle}
                setMeaning={setMeaning}
                currentTime={currentTime}
                primarySub={primarySub}
                primaryShift={primaryShift}
                primaryStyling={primaryStyling}
                getLearningStateClass={getLearningStateClass}
                changeLearningState={changeLearningState}
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
                changeLearningState={changeLearningState}
                setExternalContent={setExternalContent}
                setRubyCopyContent={setRubyCopyContent}
            />
          </div>
          <LiveCaptionControl
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
          <div className={"flex flex-col justify-end bottom-0 z-[15] fixed"}>
            {player && <VideoController
                isPlaying={isPlaying}
                duration={duration}
                changeTimeTo={changeTimeTo}
                deltaTime={deltaTime}
                togglePlay={togglePlay}
                player={player}
                currentTime={currentTime}
                showController={showController}
                setShowSidebar={setShowSidebar}
                enableSeeker={enableSeeker}
                setEnableSeeker={setEnableSeeker}
                onVideoChangeHandler={onVideoChangeHandler}
                backToHead={backToHead}
                setPitchValue={setPitchValue}/>}
          </div>
          {tokenizerMode !== '' && <MiteiruDropzone onDrop={onLoadFiles} deltaTime={deltaTime}/>}
        </div>

        <LyricsSearchModal
            isOpen={showLyricsSearch}
            onClose={() => setShowLyricsSearch(false)}
            videoSrc={videoSrc}
            metadata={metadata}
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
        <MediaTrackSelectionModal
            isOpen={showTrackSelectionModal}
            onClose={handleCloseTrackSelectionModal}
            onConfirm={handleMediaTrackSelection}
            fileName={mediaFileName}
            subtitleTracks={mediaInfo.subtitleTracks}
            currentAppLanguage={currentAppLanguage}
            videoUrl={mediaVideoUrl}
        />
        <AudioReencodeModal
            isOpen={showAudioReencodeModal}
            onClose={handleCloseAudioReencodeModal}
            onConfirm={handleAudioReencodeModalConfirm}
            onSkip={handleAudioReencodeSkip}
            fileName={mediaFileName}
            audioTracks={mediaInfo.audioTracks}
            videoTracks={mediaInfo.videoTracks || []}
            currentAppLanguage={currentAppLanguage}
        />
        <ReencodeProgressModal
            isOpen={showReencodeProgress}
            fileName={mediaFileName}
            selectedAudioTrack={selectedAudioTrackLabel}
            progress={reencodeProgress}
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
                 setToneType={setToneType} subtitleMode={subtitleMode}
                 setSubtitleMode={setSubtitleMode}/>
        <VocabSidebar
            showVocabSidebar={showVocabSidebar}
            setShowVocabSidebar={setShowVocabSidebar}
            lang={lang}
            setMeaning={setMeaning}
            tokenizeMiteiru={tokenizeMiteiru}
            refreshTrigger={refreshTrigger}
        />
      </React.Fragment>
  );
}

export default Video