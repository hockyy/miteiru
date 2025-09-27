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
      } else if (analysis.audioTracks.length > 0 || analysis.subtitleTracks.length > 0) {
        // Show modal if we have tracks to select
        console.log('[useMediaAnalysis] Showing track selection modal');
        setTimeout(() => setShowTrackSelectionModal(true), 100);
      } else {
        console.log('[useMediaAnalysis] No embedded tracks found, skipping modal');
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

  // Handle track selection from modal
  const handleTrackSelection = useCallback(async (selection: TrackSelection, onSubtitleLoad?: (path: string, type: 'primary' | 'secondary') => void, onAudioSelect?: (trackIndex: number) => void) => {
    console.log('[useMediaAnalysis] Track selection received:', selection);
    setSelectedTracks(selection);
    setShowTrackSelectionModal(false);

    try {
      // Handle audio track selection
      if (onAudioSelect && selection.audioTrackIndex >= 0) {
        console.log('[useMediaAnalysis] Setting audio track:', selection.audioTrackIndex);
        onAudioSelect(selection.audioTrackIndex);
      }

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
    handleTrackSelection,
    handleCloseTrackSelectionModal,
    selectedTracks
  };
};

export default useMediaAnalysis;
