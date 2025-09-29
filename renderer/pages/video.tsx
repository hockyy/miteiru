import React, { useEffect, useCallback } from "react";
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
    checkForNewDay,
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
    isAnalyzing,
    handleEmbeddedSubtitleSelect,
    hasEmbeddedSubtitles,
    hasMultipleAudioTracks,
    showTrackSelectionModal,
    showAudioReencodeModal,
    showReencodeProgress,
    reencodeProgress,
    selectedAudioForRencode,
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    handleCloseAudioReencodeModal,
    handleAudioReencodeConfirm,
    handleAudioReencodeSkip,
    selectedTracks
  } = useMediaAnalysis(videoSrc.path);

  // Handle embedded subtitle loading
  const handleEmbeddedSubtitleLoad = useCallback((filePath: string, type: 'primary' | 'secondary') => {
    // Use the specialized embedded subtitle loader
    loadEmbeddedSubtitle(filePath, type);
  }, [loadEmbeddedSubtitle]);

  // Handle audio track selection
  const handleAudioTrackSelect = useCallback((trackIndex: number) => {
    
    // Store the selection for when player is ready
    const applyAudioTrack = () => {
      if (player && player.audioTracks) {
        const audioTrackList = player.audioTracks();
        
        // Video.js audio tracks might be in different order than ffprobe
        // For now, try direct mapping but log everything for debugging
        if (audioTrackList && audioTrackList.length > trackIndex) {
          // Disable all audio tracks
          for (let i = 0; i < audioTrackList.length; i++) {
            audioTrackList[i].enabled = false;
          }
          // Enable selected track
          audioTrackList[trackIndex].enabled = true;
        } else {
          
          // Fallback: try to find by language if possible
          const selectedTrack = mediaInfo.audioTracks[trackIndex];
          if (selectedTrack?.language) {
            for (let i = 0; i < audioTrackList.length; i++) {
              if (audioTrackList[i].language === selectedTrack.language) {
                audioTrackList[i].enabled = true;
                break;
              }
            }
          }
        }
      } else {
        setTimeout(applyAudioTrack, 1000);
      }
    };

    applyAudioTrack();
  }, [player, mediaInfo.audioTracks]);

  // Handle loading reencoded video with selected audio
  const handleReencodedVideoLoad = useCallback((videoPath: string) => {
    // Load the reencoded video file
    onLoadFiles([{path: videoPath}]);
  }, [onLoadFiles]);

  // Enhanced track selection handler (now subtitle-only)
  const handleMediaTrackSelection = useCallback(async (selection) => {
    console.log('[Video] Handling media track selection:', selection);
    
    // Close the modal immediately when user confirms
    handleCloseTrackSelectionModal();
    
    try {
      // Handle YouTube subtitles differently from embedded subtitles
      if (selection.primarySubtitleType === 'youtube' || selection.secondarySubtitleType === 'youtube') {
        const videoId = videoSrc.path.includes('youtube.com') || videoSrc.path.includes('youtu.be') 
          ? videoSrc.path.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1]
          : null;
          
        if (!videoId) {
          throw new Error('Invalid YouTube URL');
        }
        
        // Download and load YouTube subtitles
        const downloadPromises = [];
        
        if (selection.primarySubtitleType === 'youtube' && selection.youtubeSubtitleLanguage) {
          console.log(`[Video] Downloading YouTube primary subtitle: ${selection.youtubeSubtitleLanguage}`);
          
          setToastInfo({
            message: `Downloading primary YouTube subtitle (${selection.youtubeSubtitleLanguage})...`,
            update: Math.random().toString()
          });
          
          const primaryPromise = window.ipc.invoke("downloadYoutubeSubtitle", videoId, selection.youtubeSubtitleLanguage)
            .then(result => {
              if (result.success && result.filePath) {
                console.log(`[Video] Primary subtitle downloaded to: ${result.filePath}`);
                onLoadFiles([{path: result.filePath}]);
                setToastInfo({
                  message: `Primary YouTube subtitle loaded (${selection.youtubeSubtitleLanguage})`,
                  update: Math.random().toString()
                });
              } else {
                throw new Error(result.error || 'Download failed');
              }
            })
            .catch(error => {
              console.error('Failed to download YouTube primary subtitle:', error);
              setToastInfo({
                message: `Failed to load primary YouTube subtitle: ${error.message}`,
                update: Math.random().toString()
              });
            });
          
          downloadPromises.push(primaryPromise);
        }
        
        if (selection.secondarySubtitleType === 'youtube' && selection.youtubeSubtitleLanguage) {
          console.log(`[Video] Downloading YouTube secondary subtitle: ${selection.youtubeSubtitleLanguage}`);
          
          setToastInfo({
            message: `Downloading secondary YouTube subtitle (${selection.youtubeSubtitleLanguage})...`,
            update: Math.random().toString()
          });
          
          const secondaryPromise = window.ipc.invoke("downloadYoutubeSubtitle", videoId, selection.youtubeSubtitleLanguage)
            .then(result => {
              if (result.success && result.filePath) {
                console.log(`[Video] Secondary subtitle downloaded to: ${result.filePath}`);
                onLoadFiles([{path: result.filePath}]);
                setToastInfo({
                  message: `Secondary YouTube subtitle loaded (${selection.youtubeSubtitleLanguage})`,
                  update: Math.random().toString()
                });
              } else {
                throw new Error(result.error || 'Download failed');
              }
            })
            .catch(error => {
              console.error('Failed to download YouTube secondary subtitle:', error);
              setToastInfo({
                message: `Failed to load secondary YouTube subtitle: ${error.message}`,
                update: Math.random().toString()
              });
            });
          
          downloadPromises.push(secondaryPromise);
        }
      }
      
      // Handle embedded subtitles (existing logic)
      if (selection.primarySubtitleType === 'embedded' || selection.secondarySubtitleType === 'embedded') {
        await handleTrackSelection(selection, handleEmbeddedSubtitleLoad);
      }
      
      // Show success message if no subtitles were selected
      if (!selection.primarySubtitleType && !selection.secondarySubtitleType) {
        setToastInfo({
          message: 'No subtitles selected',
          update: Math.random().toString()
        });
      }
      
    } catch (error) {
      console.error('Error handling media track selection:', error);
      setToastInfo({
        message: `Failed to load selected tracks: ${error.message}`,
        update: Math.random().toString()
      });
    }
  }, [handleTrackSelection, handleEmbeddedSubtitleLoad, setToastInfo, videoSrc.path, onLoadFiles, handleCloseTrackSelectionModal]);

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
          }} onReady={readyCallback} setCurrentTime={setCurrentTime} pitchValue={pitchValue}/>
          <div>
            <SubtitleDisplay
                // Primary subtitle props
                showPrimarySub={showPrimarySub}
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
            fileName={pendingSubtitlePath.split('/').pop() || pendingSubtitlePath.split('\\').pop() || 'Unknown file'}
            currentAppLanguage={currentAppLanguage}
        />
        <MediaTrackSelectionModal
            isOpen={showTrackSelectionModal}
            onClose={handleCloseTrackSelectionModal}
            onConfirm={handleMediaTrackSelection}
            fileName={videoSrc.path.split('/').pop() || videoSrc.path.split('\\').pop() || 'Unknown file'}
            subtitleTracks={mediaInfo.subtitleTracks}
            currentAppLanguage={currentAppLanguage}
            videoUrl={videoSrc.path.startsWith('http') ? videoSrc.path : undefined}
        />
        <AudioReencodeModal
            isOpen={showAudioReencodeModal}
            onClose={handleCloseAudioReencodeModal}
            onConfirm={(trackIndex, convertToX264) => handleAudioReencodeConfirm(trackIndex, handleReencodedVideoLoad, convertToX264)}
            onSkip={handleAudioReencodeSkip}
            fileName={videoSrc.path.split('/').pop() || videoSrc.path.split('\\').pop() || 'Unknown file'}
            audioTracks={mediaInfo.audioTracks}
            videoTracks={mediaInfo.videoTracks || []}
            currentAppLanguage={currentAppLanguage}
        />
        <ReencodeProgressModal
            isOpen={showReencodeProgress}
            fileName={videoSrc.path.split('/').pop() || videoSrc.path.split('\\').pop() || 'Unknown file'}
            selectedAudioTrack={selectedAudioForRencode ? `${selectedAudioForRencode.title || selectedAudioForRencode.language || 'Track'} (${selectedAudioForRencode.codec})` : ''}
            progress={reencodeProgress}
        />
        <CommandPalette
            showCommandPalette={showCommandPalette}
            setShowCommandPalette={setShowCommandPalette}
            commands={commands}
        />
        <Sidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar}
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