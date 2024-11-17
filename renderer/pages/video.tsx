import React from "react";
import VideoJS from "../components/VideoPlayer/VideoJS";
import MiteiruDropzone from "../components/VideoPlayer/MiteiruDropzone";
import {PrimarySubtitle, SecondarySubtitle} from "../components/Subtitle/Subtitle";
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

function Video() {
  const {
    contentString,
    setExternalContent
  } = useContentString();
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
    reloadLastSecondarySubtitle
  } = useLoadFiles(setToastInfo,
      primarySub, setPrimarySub,
      secondarySub, setSecondarySub,
      primaryStyling,
      tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang, setFrequencyPrimary);
  const {
    showController,
    setShowController,
    showSidebar,
    setShowSidebar
  } = useMenuDisplay();

  const [rubyContent, setRubyCopyContent] = useRubyCopy();
  useKeyBind(setMeaning, setShowController, setShowSidebar,
      setPrimarySub, setSecondarySub, primarySub, undo,
      setShowPrimarySub, setShowSecondarySub, primaryStyling, setPrimaryStyling,
      openDeepL, openGoogleTranslate, reloadLastPrimarySubtitle, reloadLastSecondarySubtitle,
      setShowVocabSidebar, rubyContent, contentString);
  const {
    togglePlay,
    isPlaying,
    setIsPlaying
  } = useVideoPlayingToggle(player, metadata);
  const {
    autoPause,
    setAutoPause,
    backToHead
  } = usePauseAndRepeat(primaryTimeCache, player, currentTime, primaryShift, setIsPlaying, changeTimeTo);

  useVideoKeyboardControls(togglePlay, deltaTime, setPrimaryShift, setSecondaryShift,
      setToastInfo, backToHead, setIsPlaying);
  usePlayNextAfterEnd(player, currentTime, onVideoChangeHandler, duration, setEnableSeeker);
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
          <VideoJS options={{
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
          }} onReady={readyCallback} setCurrentTime={setCurrentTime}/>
          <div>
            {showPrimarySub && <PrimarySubtitle setMeaning={setMeaning}
                                                currentTime={currentTime}
                                                subtitle={primarySub}
                                                shift={primaryShift}
                                                subtitleStyling={primaryStyling}
                                                getLearningStateClass={getLearningStateClass}
                                                changeLearningState={changeLearningState}
                                                timeCache={primaryTimeCache}
                                                setTimeCache={setPrimaryTimeCache}
                                                setExternalContent={setExternalContent}
                                                setRubyCopyContent={setRubyCopyContent}/>}
            {showSecondarySub && <SecondarySubtitle
                currentTime={currentTime}
                subtitle={secondarySub}
                shift={secondaryShift}
                subtitleStyling={secondaryStyling}
                timeCache={secondaryTimeCache}
                setTimeCache={setSecondaryTimeCache}/>}
          </div>
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
                backToHead={backToHead}/>}
          </div>
          {tokenizerMode !== '' && <MiteiruDropzone onDrop={onLoadFiles} deltaTime={deltaTime}/>}
        </div>
        <Sidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar}
                 primaryStyling={primaryStyling}
                 setPrimaryStyling={setPrimaryStyling}
                 secondaryStyling={secondaryStyling}
                 setSecondaryStyling={setSecondaryStyling}
                 autoPause={autoPause}
                 setAutoPause={setAutoPause}
                 learningPercentage={learningPercentage}
                 setLearningPercentage={setLearningPercentage} lang={lang} toneType={toneType}
                 setToneType={setToneType}/>
        <VocabSidebar
            showVocabSidebar={showVocabSidebar}
            setShowVocabSidebar={setShowVocabSidebar}
            lang={lang}
            setMeaning={setMeaning}
            tokenizeMiteiru={tokenizeMiteiru}
        />
      </React.Fragment>
  );
}

export default Video