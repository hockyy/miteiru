import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaInfo } from '../types/media';
import { TrackSelection } from '../components/Utils/MediaTrackSelectionModal';
import { getActiveNativePlayer } from '../utils/nativePlayer';

const deleteTempSubtitle = (filePath: string) => {
  window.electronAPI.cleanupTempSubtitle(filePath).catch(err =>
    console.warn('Failed to cleanup temp subtitle:', err)
  );
};

const useMediaAnalysis = (videoPath: string) => {
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
      const analysis = await window.electronAPI.analyzeMediaFile(path);
      setMediaInfo(analysis);
      
      // A failed analysis (FFmpeg missing, usually) is reported by the video page from `mediaInfo.error`.
      if (!analysis.error) {
        // Determine what modal to show based on track availability
        const hasMultipleAudio = analysis.audioTracks.length > 1;
        const hasSingleAudio = analysis.audioTracks.length === 1;
        const hasSubtitles = analysis.subtitleTracks.length > 0;

        // libmpv plays every codec as-is; only a choice of audio track is left to ask.
        if (hasMultipleAudio) {
          setTimeout(() => setShowAudioTrackModal(true), 100);
        } else if (hasSingleAudio && hasSubtitles) {
          setTimeout(() => setShowTrackSelectionModal(true), 100);
        }
      }
    } catch (error) {
      setMediaInfo({
        duration: 0,
        audioTracks: [],
        subtitleTracks: [],
        videoTracks: [],
        error: error.message,
        toolsAvailable: false
      });
    } finally {
      setIsAnalyzing(false);
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

  // Check if path is YouTube URL
  const isYoutubeUrl = useCallback((path: string): boolean => {
    return path.includes('youtube.com') || path.includes('youtu.be');
  }, []);

  // Analyze media when video path changes
  useEffect(() => {
    if (videoPath && videoPath !== '') {
      if (!videoPath.startsWith('http')) {
        // Analyze local video files
        analyzeMedia(videoPath);
      } else if (isYoutubeUrl(videoPath)) {
        // For YouTube videos, show track selection modal immediately
        // Set empty media info but trigger modal
        setMediaInfo({
          duration: 0,
          audioTracks: [],
          subtitleTracks: [], // Will be populated by YouTube subtitles in modal
          videoTracks: []
        });
        console.log('[useMediaAnalysis] YouTube video detected, showing subtitle selection modal');
        setTimeout(() => setShowTrackSelectionModal(true), 100);
      }
    }
  }, [videoPath, analyzeMedia, isYoutubeUrl]);

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
          window.electronAPI.extractEmbeddedSubtitle(
            videoPath, 
            track.index, 
            track.codec === 'ass' ? 'ass' : 'srt'
          ).then(tempPath => ({ track, tempPath, type: 'primary' }))
        );
      }

      if (selection.secondarySubtitleType === 'embedded' && selection.secondarySubtitleTrackIndex !== null && mediaInfo.subtitleTracks[selection.secondarySubtitleTrackIndex]) {
        const track = mediaInfo.subtitleTracks[selection.secondarySubtitleTrackIndex];
        promises.push(
          window.electronAPI.extractEmbeddedSubtitle(
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
    getActiveNativePlayer()?.setAudioTrack(audioTrackIndex + 1);
    if (mediaInfo.subtitleTracks.length > 0) {
      setTimeout(() => setShowTrackSelectionModal(true), 100);
    }
  }, [mediaInfo.subtitleTracks.length]);

  const handleAudioTrackSkip = useCallback(() => {
    setShowAudioTrackModal(false);
    
    // Check if we should show subtitle selection for the default audio
    if (mediaInfo.subtitleTracks.length > 0) {
      setTimeout(() => setShowTrackSelectionModal(true), 100);
    }
  }, [mediaInfo.subtitleTracks]);

  // Delete the extracted subtitles when the video changes or the page closes.
  useEffect(() => {
    activeVideoPath.current = videoPath;
    return () => {
      activeVideoPath.current = null;
      const files = tempSubtitleFiles.current;
      tempSubtitleFiles.current = [];
      files.forEach(deleteTempSubtitle);
    };
  }, [videoPath]);

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
    selectedTracks
  };
};

export default useMediaAnalysis;
