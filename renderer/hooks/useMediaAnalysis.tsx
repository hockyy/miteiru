import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaInfo, MediaTrack } from '../types/media';
import { TrackSelection } from '../components/Utils/MediaTrackSelectionModal';

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
  const [showTrackSelectionModal, setShowTrackSelectionModal] = useState(false);
  const [showAudioReencodeModal, setShowAudioReencodeModal] = useState(false);
  const [showReencodeProgress, setShowReencodeProgress] = useState(false);
  const [reencodeProgress, setReencodeProgress] = useState('');
  const [selectedAudioForRencode, setSelectedAudioForRencode] = useState<MediaTrack | null>(null);
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
      
      // Show error toast if tools are not available
      if (analysis.error) {
      } else {
        // Determine what modal to show based on track availability
        const hasMultipleAudio = analysis.audioTracks.length > 1;
        const hasSingleAudio = analysis.audioTracks.length === 1;
        const hasSubtitles = analysis.subtitleTracks.length > 0;
        const hasHEVC = analysis.videoTracks.some(track => 
          track.codec.toLowerCase().includes('hevc') || 
          track.codec.toLowerCase().includes('h265') ||
          track.codec.toLowerCase().includes('h.265')
        );
        
        if (hasMultipleAudio || hasHEVC) {
          setTimeout(() => setShowAudioReencodeModal(true), 100);
        } else if (hasSingleAudio && hasSubtitles) {
          setTimeout(() => setShowTrackSelectionModal(true), 100);
        } else {
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
        
        // Store temp files for cleanup
        tempSubtitleFiles.current.push(...extractedSubtitles.map(sub => sub.tempPath));

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

  const handleCloseAudioReencodeModal = useCallback(() => {
    setShowAudioReencodeModal(false);
  }, []);

  const handleAudioReencodeConfirm = useCallback(async (selectedAudioTrack: number, onVideoLoad?: (videoPath: string) => void, convertToX264?: boolean, convertAudioToAac?: boolean) => {
    console.log(`[DEBUG Frontend] Starting media processing - Track: ${selectedAudioTrack}, convertToX264: ${convertToX264}, convertAudioToAac: ${convertAudioToAac}`);
    setShowAudioReencodeModal(false);
    
    const selectedTrack = mediaInfo.audioTracks[selectedAudioTrack];
    console.log(`[DEBUG Frontend] Selected track:`, selectedTrack);
    console.log(`[DEBUG Frontend] Video path:`, videoPath);
    console.log(`[DEBUG Frontend] Media duration:`, mediaInfo.duration);
    
    setSelectedAudioForRencode(selectedTrack);
    setShowReencodeProgress(true);
    setReencodeProgress(convertToX264 ? 'Starting video conversion...' : convertAudioToAac ? 'Starting audio conversion...' : 'Starting fast remux...');
    
    // Set up progress listener; removed in `finally` so a failed conversion does not leak it.
    const progressHandler = (progress: string) => {
      console.log(`[DEBUG Frontend] Progress update:`, progress);
      setReencodeProgress(progress);
    };
    const removeProgressListener = window.ipc.on('reencode-progress', progressHandler);

    try {
      
      // Start media processing
      console.log(`[DEBUG Frontend] Calling reencodeVideoWithAudioTrack...`);
      const reencodedVideoPath = await window.electronAPI.reencodeVideoWithAudioTrack(
        videoPath,
        selectedTrack.index,
        convertToX264,
        convertAudioToAac,
        mediaInfo.duration
      );
      
      console.log(`[DEBUG Frontend] Media processing completed:`, reencodedVideoPath);
      
      setShowReencodeProgress(false);
      setReencodeProgress('');
      
      // Load the processed video
      if (onVideoLoad) {
        onVideoLoad(reencodedVideoPath);
        
        // After loading the new video, show subtitle selection if there are embedded subtitles
        if (mediaInfo.subtitleTracks.length > 0) {
          setTimeout(() => setShowTrackSelectionModal(true), 1000);
        }
      }
      
    } catch (error) {
      console.error(`[DEBUG Frontend] Media processing error:`, error);
      setShowReencodeProgress(false);
      setReencodeProgress('');
      // TODO: Show error toast
    } finally {
      removeProgressListener();
    }
  }, [videoPath, mediaInfo.audioTracks, mediaInfo.duration, mediaInfo.subtitleTracks.length]);

  const handleAudioReencodeSkip = useCallback(() => {
    setShowAudioReencodeModal(false);
    
    // Check if we should show subtitle selection for the default audio
    if (mediaInfo.subtitleTracks.length > 0) {
      setTimeout(() => setShowTrackSelectionModal(true), 100);
    }
  }, [mediaInfo.subtitleTracks]);

  // Delete the extracted subtitles when the video changes or the page closes.
  useEffect(() => () => {
    const files = tempSubtitleFiles.current;
    tempSubtitleFiles.current = [];
    files.forEach(filePath => {
      window.electronAPI.cleanupTempSubtitle(filePath).catch(err =>
        console.warn('Failed to cleanup temp subtitle:', err)
      );
    });
  }, [videoPath]);

  return {
    mediaInfo,
    isAnalyzing,
    analyzeMedia,
    handleEmbeddedSubtitleSelect,
    hasEmbeddedSubtitles: mediaInfo.subtitleTracks.length > 0,
    hasMultipleAudioTracks: mediaInfo.audioTracks.length > 1,
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
  };
};

export default useMediaAnalysis;
