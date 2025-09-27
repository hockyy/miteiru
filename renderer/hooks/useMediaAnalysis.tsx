import { useState, useEffect, useCallback } from 'react';
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
  const [tempSubtitleFiles, setTempSubtitleFiles] = useState<string[]>([]);
  const [showTrackSelectionModal, setShowTrackSelectionModal] = useState(false);
  const [showAudioReencodeModal, setShowAudioReencodeModal] = useState(false);
  const [showReencodeProgress, setShowReencodeProgress] = useState(false);
  const [reencodeProgress, setReencodeProgress] = useState('');
  const [selectedAudioForRencode, setSelectedAudioForRencode] = useState<MediaTrack | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<TrackSelection | null>(null);

  const analyzeMedia = useCallback(async (path: string): Promise<void> => {
    console.log('[useMediaAnalysis] analyzeMedia called with path:', path);
    
    if (!path || path === '') {
      console.log('[useMediaAnalysis] Empty path, resetting media info');
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
      console.log('[useMediaAnalysis] Calling electronAPI.analyzeMediaFile');
      const analysis = await window.electronAPI.analyzeMediaFile(path);
      console.log('[useMediaAnalysis] Analysis result:', analysis);
      setMediaInfo(analysis);
      
      // Show error toast if tools are not available
      if (analysis.error) {
        console.warn('[useMediaAnalysis] Analysis completed with error:', analysis.error);
      } else {
        // Determine what modal to show based on track availability
        const hasMultipleAudio = analysis.audioTracks.length > 1;
        const hasSingleAudio = analysis.audioTracks.length === 1;
        const hasSubtitles = analysis.subtitleTracks.length > 0;
        
        if (hasMultipleAudio) {
          console.log('[useMediaAnalysis] Multiple audio tracks - showing audio reencode modal');
          setTimeout(() => setShowAudioReencodeModal(true), 100);
        } else if (hasSingleAudio && hasSubtitles) {
          console.log('[useMediaAnalysis] Single audio + subtitles - showing subtitle selection modal');
          setTimeout(() => setShowTrackSelectionModal(true), 100);
        } else {
          console.log('[useMediaAnalysis] Simple video - no modals needed');
        }
      }
    } catch (error) {
      console.error('[useMediaAnalysis] Failed to analyze media file:', error);
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
        setTempSubtitleFiles(prev => [...prev, track.tempFilePath]);
      }
      
      return track.tempFilePath;
    } catch (error) {
      console.error('Failed to handle embedded subtitle:', error);
      throw error;
    }
  }, []);

  // Analyze media when video path changes
  useEffect(() => {
    console.log('[useMediaAnalysis] useEffect triggered with videoPath:', videoPath);
    if (videoPath && videoPath !== '' && !videoPath.startsWith('http')) {
      // Only analyze local video files, not YouTube URLs
      console.log('[useMediaAnalysis] Triggering analysis for local file:', videoPath);
      analyzeMedia(videoPath);
    } else {
      console.log('[useMediaAnalysis] Skipping analysis - empty path or URL:', videoPath);
    }
  }, [videoPath, analyzeMedia]);

  // Handle track selection from modal (now only for subtitles)
  const handleTrackSelection = useCallback(async (selection: TrackSelection, onSubtitleLoad?: (path: string, type: 'primary' | 'secondary') => void, onVideoWithAudioLoad?: (videoPath: string) => void) => {
    console.log('[useMediaAnalysis] Track selection received:', selection);
    setSelectedTracks(selection);
    setShowTrackSelectionModal(false);

    try {
      // This handler now only deals with subtitle tracks
      // Audio track selection is handled separately via reencoding flow
      
      // Extract and load selected subtitle tracks
      const promises = [];
      
      if (selection.primarySubtitleTrackIndex !== null && mediaInfo.subtitleTracks[selection.primarySubtitleTrackIndex]) {
        const track = mediaInfo.subtitleTracks[selection.primarySubtitleTrackIndex];
        promises.push(
          window.electronAPI.extractEmbeddedSubtitle(
            videoPath, 
            track.index, 
            track.codec === 'ass' ? 'ass' : 'srt'
          ).then(tempPath => ({ track, tempPath, type: 'primary' }))
        );
      }

      if (selection.secondarySubtitleTrackIndex !== null && mediaInfo.subtitleTracks[selection.secondarySubtitleTrackIndex]) {
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
        console.log('[useMediaAnalysis] Extracting', promises.length, 'subtitle tracks');
        const extractedSubtitles = await Promise.all(promises);
        
        // Store temp files for cleanup
        setTempSubtitleFiles(prev => [
          ...prev, 
          ...extractedSubtitles.map(sub => sub.tempPath)
        ]);

        // Load extracted subtitles using the existing subtitle loading mechanism
        if (onSubtitleLoad) {
          for (const subtitle of extractedSubtitles) {
            console.log(`[useMediaAnalysis] Loading ${subtitle.type} subtitle:`, subtitle.tempPath);
            onSubtitleLoad(subtitle.tempPath, subtitle.type as 'primary' | 'secondary');
          }
        }
      }

      return {
        audioTrackIndex: selection.audioTrackIndex,
        extractedSubtitles: promises.length > 0 ? await Promise.all(promises) : []
      };
    } catch (error) {
      console.error('[useMediaAnalysis] Error in track selection:', error);
      throw error;
    }
  }, [videoPath, mediaInfo]);

  const handleCloseTrackSelectionModal = useCallback(() => {
    setShowTrackSelectionModal(false);
  }, []);

  const handleCloseAudioReencodeModal = useCallback(() => {
    setShowAudioReencodeModal(false);
  }, []);

  const handleAudioReencodeConfirm = useCallback(async (selectedAudioTrack: number, onVideoLoad?: (videoPath: string) => void) => {
    console.log('[useMediaAnalysis] User chose to reencode with audio track:', selectedAudioTrack);
    setShowAudioReencodeModal(false);
    
    const selectedTrack = mediaInfo.audioTracks[selectedAudioTrack];
    setSelectedAudioForRencode(selectedTrack);
    setShowReencodeProgress(true);
    setReencodeProgress('Starting reencoding...');
    
    try {
      // Set up progress listener
      const progressHandler = (progress: string) => {
        console.log('[useMediaAnalysis] Reencode progress:', progress);
        setReencodeProgress(progress);
      };
      
      const removeProgressListener = window.ipc.on('reencode-progress', progressHandler);
      
      // Start reencoding
      const reencodedVideoPath = await window.electronAPI.reencodeVideoWithAudioTrack(
        videoPath,
        selectedTrack.index
      );
      
      // Clean up progress listener
      removeProgressListener();
      
      console.log('[useMediaAnalysis] Reencoding completed:', reencodedVideoPath);
      setShowReencodeProgress(false);
      setReencodeProgress('');
      
      // Load the reencoded video
      if (onVideoLoad) {
        onVideoLoad(reencodedVideoPath);
        
        // After loading the new video, show subtitle selection if there are embedded subtitles
        if (mediaInfo.subtitleTracks.length > 0) {
          console.log('[useMediaAnalysis] Showing subtitle selection after reencoding');
          setTimeout(() => setShowTrackSelectionModal(true), 1000);
        }
      }
      
    } catch (error) {
      console.error('[useMediaAnalysis] Reencoding failed:', error);
      setShowReencodeProgress(false);
      setReencodeProgress('');
      // TODO: Show error toast
    }
  }, [videoPath, mediaInfo.audioTracks]);

  const handleAudioReencodeSkip = useCallback(() => {
    console.log('[useMediaAnalysis] User chose to play with default audio');
    setShowAudioReencodeModal(false);
    
    // Check if we should show subtitle selection for the default audio
    if (mediaInfo.subtitleTracks.length > 0) {
      console.log('[useMediaAnalysis] Showing subtitle selection after skipping audio reencode');
      setTimeout(() => setShowTrackSelectionModal(true), 100);
    }
  }, [mediaInfo.subtitleTracks]);

  // Cleanup temp files when component unmounts or video changes
  useEffect(() => {
    return () => {
      tempSubtitleFiles.forEach(filePath => {
        window.electronAPI.cleanupTempSubtitle(filePath).catch(err => 
          console.warn('Failed to cleanup temp subtitle:', err)
        );
      });
    };
  }, [tempSubtitleFiles]);

  // Clean up temp files when video changes
  useEffect(() => {
    if (tempSubtitleFiles.length > 0) {
      tempSubtitleFiles.forEach(filePath => {
        window.electronAPI.cleanupTempSubtitle(filePath).catch(err => 
          console.warn('Failed to cleanup temp subtitle:', err)
        );
      });
      setTempSubtitleFiles([]);
    }
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
