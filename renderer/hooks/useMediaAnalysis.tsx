import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaInfo } from '../types/media';
import { TrackSelection } from '../components/Utils/MediaTrackSelectionModal';
import { getActiveNativePlayer } from '../utils/nativePlayer';
import { isLocalPath, isYoutube } from '../utils/utils';
import { playingAudioTrack } from '../utils/mediaUtils';

// Only a file on this computer is read for its tracks: a YouTube link asks for captions instead, and
// another web link is played as it is.
const isAnalysedFile = (path: string) => isLocalPath(path) && !isYoutube(path);

const deleteTempSubtitle = (filePath: string) => {
  window.miteiru.cleanupTempSubtitle(filePath).catch(err =>
    console.warn('Failed to cleanup temp subtitle:', err)
  );
};

/** `openedVideo`: the source object of the open video, new on every open, so the same path opened again starts over. */
const useMediaAnalysis = (videoPath: string, openedVideo?: object) => {
  const [mediaInfo, setMediaInfo] = useState<MediaInfo>({
    duration: 0,
    audioTracks: [],
    subtitleTracks: [],
    videoTracks: []
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Subtitles extracted from the current video. A ref: deleting them must wait for the video to change,
  // not happen whenever another one is added.
  const tempSubtitleFiles = useRef<string[]>([]);
  // The video those subtitles belong to; null once the page closes.
  const activeVideoPath = useRef<string | null>(videoPath);
  const [showTrackSelectionModal, setShowTrackSelectionModal] = useState(false);
  const [showAudioTrackModal, setShowAudioTrackModal] = useState(false);
  // Why the audio picker is open: the file just opened (then subtitles come next) or a switch from the menu.
  const [audioPickerReason, setAudioPickerReason] = useState<'open' | 'switch'>('open');
  // The audio track chosen for the open video (0-based index into audioTracks); null until one is.
  const [chosenAudioIndex, setChosenAudioIndex] = useState<number | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<TrackSelection | null>(null);

  const analyzeMedia = useCallback(async (path: string): Promise<void> => {
    
    if (!path || path === '') {
      setMediaInfo({
        duration: 0,
        audioTracks: [],
        subtitleTracks: [],
        videoTracks: []
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const analysis = await window.miteiru.analyzeMediaFile(path);
      // Another video was opened while this one was being read: its tracks are not the open video's.
      if (activeVideoPath.current !== path) return;
      setMediaInfo(analysis);
      
      // A failed analysis (FFmpeg missing, usually) is reported by the video page from `mediaInfo.error`.
      if (!analysis.error) {
        // Determine what modal to show based on track availability
        const hasMultipleAudio = analysis.audioTracks.length > 1;
        const hasSingleAudio = analysis.audioTracks.length === 1;
        const hasSubtitles = analysis.subtitleTracks.length > 0;

        // libmpv plays every codec as-is; only a choice of audio track is left to ask.
        if (hasMultipleAudio) {
          setTimeout(() => {
            if (activeVideoPath.current === path) {
              setAudioPickerReason('open');
              setShowAudioTrackModal(true);
            }
          }, 100);
        } else if (hasSingleAudio && hasSubtitles) {
          setTimeout(() => {
            if (activeVideoPath.current === path) setShowTrackSelectionModal(true);
          }, 100);
        }
      }
    } catch (error) {
      if (activeVideoPath.current !== path) return;
      setMediaInfo({
        duration: 0,
        audioTracks: [],
        subtitleTracks: [],
        videoTracks: [],
        error: error.message,
        toolsAvailable: false
      });
    } finally {
      // A newer local video's own analysis turns the flag off when it ends.
      const current = activeVideoPath.current;
      const newerRunning = current !== path && Boolean(current) && isAnalysedFile(current);
      if (!newerRunning) setIsAnalyzing(false);
    }
  }, []);

  const handleEmbeddedSubtitleSelect = useCallback(async (track) => {
    if (!track) {
      // Disable embedded subtitles
      return;
    }

    try {
      // The extraction is handled by the SubtitleTrackSelector component
      // This callback can be used for additional processing if needed
      
      // Store temp file for cleanup
      if (track.tempFilePath) {
        tempSubtitleFiles.current.push(track.tempFilePath);
      }
      
      return track.tempFilePath;
    } catch (error) {
      console.error('Failed to handle embedded subtitle:', error);
      throw error;
    }
  }, []);

  // Analyze media when video path changes
  useEffect(() => {
    if (videoPath && videoPath !== '') {
      if (isAnalysedFile(videoPath)) {
        analyzeMedia(videoPath);
      } else if (isYoutube(videoPath)) {
        // Captions load in the background. The learner opens the picker from Subtitles…;
        // opening a video must not put playback behind a slow YouTube caption listing.
        setMediaInfo({
          duration: 0,
          audioTracks: [],
          subtitleTracks: [], // Will be populated by YouTube subtitles in modal
          videoTracks: []
        });
      }
    }
  }, [videoPath, openedVideo, analyzeMedia]);

  // Handle track selection from modal (now only for subtitles)
  const handleTrackSelection = useCallback(async (selection: TrackSelection, onSubtitleLoad?: (path: string, type: 'primary' | 'secondary', preprocessOptions?: TrackSelection['preprocessOptions']) => void) => {
    setSelectedTracks(selection);
    setShowTrackSelectionModal(false);

    try {
      // Extract and load selected subtitle tracks
      const promises = [];
      
      if (selection.primarySubtitleType === 'embedded' && selection.primarySubtitleTrackIndex !== null && mediaInfo.subtitleTracks[selection.primarySubtitleTrackIndex]) {
        const track = mediaInfo.subtitleTracks[selection.primarySubtitleTrackIndex];
        promises.push(
          window.miteiru.extractEmbeddedSubtitle(
            videoPath, 
            track.index, 
            track.codec === 'ass' ? 'ass' : 'srt'
          ).then(tempPath => ({ track, tempPath, type: 'primary' }))
        );
      }

      if (selection.secondarySubtitleType === 'embedded' && selection.secondarySubtitleTrackIndex !== null && mediaInfo.subtitleTracks[selection.secondarySubtitleTrackIndex]) {
        const track = mediaInfo.subtitleTracks[selection.secondarySubtitleTrackIndex];
        promises.push(
          window.miteiru.extractEmbeddedSubtitle(
            videoPath, 
            track.index, 
            track.codec === 'ass' ? 'ass' : 'srt'
          ).then(tempPath => ({ track, tempPath, type: 'secondary' }))
        );
      }

      if (promises.length > 0) {
        const extractedSubtitles = await Promise.all(promises);
        const tempPaths = extractedSubtitles.map(sub => sub.tempPath);

        // The video changed (or the page closed) while extracting: these belong to the old one.
        if (activeVideoPath.current !== videoPath) {
          tempPaths.forEach(deleteTempSubtitle);
          return {extractedSubtitles: []};
        }

        // Store temp files for cleanup
        tempSubtitleFiles.current.push(...tempPaths);

        // Load extracted subtitles using the existing subtitle loading mechanism
        if (onSubtitleLoad) {
          for (const subtitle of extractedSubtitles) {
            onSubtitleLoad(subtitle.tempPath, subtitle.type as 'primary' | 'secondary', selection.preprocessOptions);
          }
        }
        return {extractedSubtitles};
      }
      return {extractedSubtitles: []};
    } catch (error) {
      throw error;
    }
  }, [videoPath, mediaInfo]);

  const handleCloseTrackSelectionModal = useCallback(() => {
    setShowTrackSelectionModal(false);
  }, []);

  // Opens the track picker again, e.g. from the video page's Subtitles… menu.
  const openTrackSelectionModal = useCallback(() => {
    setShowTrackSelectionModal(true);
  }, []);

  // libmpv switches audio tracks itself (aid counts audio tracks from 1).
  const handleAudioTrackSelect = useCallback((audioTrackIndex: number) => {
    setShowAudioTrackModal(false);
    setChosenAudioIndex(audioTrackIndex);
    getActiveNativePlayer()?.setAudioTrack(audioTrackIndex + 1);
    // Switching from the menu only switches; the subtitle picker belongs to opening the file.
    if (audioPickerReason === 'open' && mediaInfo.subtitleTracks.length > 0) {
      setTimeout(() => setShowTrackSelectionModal(true), 100);
    }
  }, [mediaInfo.subtitleTracks.length, audioPickerReason]);

  const handleAudioTrackSkip = useCallback(() => {
    setShowAudioTrackModal(false);
    if (audioPickerReason === 'switch') return;

    // Check if we should show subtitle selection for the default audio
    if (mediaInfo.subtitleTracks.length > 0) {
      setTimeout(() => setShowTrackSelectionModal(true), 100);
    }
  }, [mediaInfo.subtitleTracks, audioPickerReason]);

  // Opens the audio picker again from the video page's Subtitles… menu, on the track mpv plays now
  // (mpv's own pick when the first picker was skipped).
  const openAudioTrackModal = useCallback(async () => {
    const path = activeVideoPath.current;
    const playing = await getActiveNativePlayer()?.audioTrack();
    if (activeVideoPath.current !== path) return;
    if (playing) setChosenAudioIndex(playing - 1);
    setAudioPickerReason('switch');
    setShowAudioTrackModal(true);
  }, []);

  // Delete the extracted subtitles when the video changes or the page closes.
  useEffect(() => {
    activeVideoPath.current = videoPath;
    setChosenAudioIndex(null);
    return () => {
      activeVideoPath.current = null;
      // Dialogs about the old video's tracks close with it.
      setShowAudioTrackModal(false);
      setShowTrackSelectionModal(false);
      const files = tempSubtitleFiles.current;
      tempSubtitleFiles.current = [];
      files.forEach(deleteTempSubtitle);
    };
  }, [videoPath, openedVideo]);

  return {
    mediaInfo,
    isAnalyzing,
    analyzeMedia,
    handleEmbeddedSubtitleSelect,
    hasEmbeddedSubtitles: mediaInfo.subtitleTracks.length > 0,
    hasMultipleAudioTracks: mediaInfo.audioTracks.length > 1,
    showTrackSelectionModal,
    showAudioTrackModal,
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    openTrackSelectionModal,
    handleAudioTrackSkip,
    handleAudioTrackSelect,
    openAudioTrackModal,
    audioPickerReason,
    playingAudioIndex: playingAudioTrack(mediaInfo.audioTracks, chosenAudioIndex),
    selectedTracks
  };
};

export default useMediaAnalysis;
