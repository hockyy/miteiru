import React, { useState, useEffect } from 'react';
import { X, FileText, Volume2, Subtitles, Play, Download, RefreshCw } from 'lucide-react';
import { AwesomeButton } from 'react-awesome-button';
import { MediaTrack } from '../../types/media';
import { useYoutubeSubtitles, YoutubeSubtitleOption } from '../../hooks/useYoutubeSubtitles';

interface MediaTrackSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: TrackSelection) => void;
  fileName: string;
  subtitleTracks: MediaTrack[];
  currentAppLanguage: string;
  videoUrl?: string; // YouTube URL for fetching online subtitles
}

export interface TrackSelection {
  primarySubtitleTrackIndex: number | null; // null means no primary subtitle
  secondarySubtitleTrackIndex: number | null; // null means no secondary subtitle
  primarySubtitleType: 'embedded' | 'youtube' | null; // null when no primary subtitle
  secondarySubtitleType: 'embedded' | 'youtube' | null; // null when no secondary subtitle
  youtubeSubtitleLanguage?: string; // Language code for YouTube subtitles
}

const MediaTrackSelectionModal: React.FC<MediaTrackSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  subtitleTracks,
  currentAppLanguage,
  videoUrl
}) => {
  const [selectedPrimarySubtitle, setSelectedPrimarySubtitle] = useState<number | null>(null);
  const [selectedSecondarySubtitle, setSelectedSecondarySubtitle] = useState<number | null>(null);
  const [selectedPrimaryType, setSelectedPrimaryType] = useState<'embedded' | 'youtube' | null>(null);
  const [selectedSecondaryType, setSelectedSecondaryType] = useState<'embedded' | 'youtube' | null>(null);
  
  // Use YouTube subtitles hook
  const { 
    subtitles: youtubeSubtitles, 
    isLoading: isLoadingYoutube, 
    error: youtubeError,
    isYoutubeUrl,
    fetchAvailableSubtitles,
    clearSubtitles 
  } = useYoutubeSubtitles();

  const isYouTubeUrl = videoUrl && isYoutubeUrl(videoUrl);

  // Fetch YouTube subtitles when modal opens for YouTube videos
  useEffect(() => {
    if (!isOpen) {
      clearSubtitles();
      return;
    }
    
    if (isYouTubeUrl && videoUrl) {
      fetchAvailableSubtitles(videoUrl);
    }
  }, [isOpen, isYouTubeUrl, videoUrl, fetchAvailableSubtitles, clearSubtitles]);

  if (!isOpen) return null;

  const getTrackLabel = (track: MediaTrack) => {
    const parts = [];
    if (track.title) parts.push(track.title);
    if (track.language) parts.push(`(${track.language.toUpperCase()})`);
    if (parts.length === 0) parts.push(`Track ${track.index + 1}`);
    if (track.default) parts.push('[Default]');
    return parts.join(' ');
  };

  const getLanguageEmoji = (lang: string) => {
    switch (lang?.toLowerCase()) {
      case 'jpn': case 'ja': return '🇯🇵';
      case 'chi': case 'zh-cn': case 'zh': return '🇨🇳';
      case 'yue': case 'zh-hk': return '🇭🇰';
      case 'eng': case 'en': return '🇺🇸';
      case 'vi': case 'vie': return '🇻🇳';
      default: return '🌐';
    }
  };

  const handlePrimarySubtitleChange = (index: number | null, type: 'embedded' | 'youtube' | null) => {
    setSelectedPrimarySubtitle(index);
    setSelectedPrimaryType(type);
  };

  const handleSecondarySubtitleChange = (index: number | null, type: 'embedded' | 'youtube' | null) => {
    setSelectedSecondarySubtitle(index);
    setSelectedSecondaryType(type);
  };

  const handleConfirm = () => {
    const selection: TrackSelection = {
      primarySubtitleTrackIndex: selectedPrimarySubtitle,
      secondarySubtitleTrackIndex: selectedSecondarySubtitle,
      primarySubtitleType: selectedPrimaryType,
      secondarySubtitleType: selectedSecondaryType,
      youtubeSubtitleLanguage: selectedPrimaryType === 'youtube' && selectedPrimarySubtitle !== null 
        ? youtubeSubtitles[selectedPrimarySubtitle]?.language 
        : selectedSecondaryType === 'youtube' && selectedSecondarySubtitle !== null
        ? youtubeSubtitles[selectedSecondarySubtitle]?.language
        : undefined
    };
    
    console.log('[MediaTrackSelectionModal] User confirmed subtitle selection:', selection);
    console.log('[MediaTrackSelectionModal] Selected subtitle tracks details:', {
      primarySub: selectedPrimarySubtitle !== null 
        ? (selectedPrimaryType === 'embedded' ? subtitleTracks[selectedPrimarySubtitle] : youtubeSubtitles[selectedPrimarySubtitle])
        : null,
      secondarySub: selectedSecondarySubtitle !== null 
        ? (selectedSecondaryType === 'embedded' ? subtitleTracks[selectedSecondarySubtitle] : youtubeSubtitles[selectedSecondarySubtitle])
        : null
    });
    
    onConfirm(selection);
  };

  const canConfirm = true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div
        className="bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Subtitles className="w-5 h-5" />
            Select Embedded Subtitles
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* File Info */}
          <div className="text-center mb-6">
            <div className="text-gray-300 text-sm mb-1">Loading media file:</div>
            <div className="text-white font-medium break-words mb-2">
              {fileName}
            </div>
            <div className="text-gray-400 text-xs">
              App language: {getLanguageEmoji(currentAppLanguage)} {currentAppLanguage} • 
              {subtitleTracks.length} embedded subtitles
              {isYouTubeUrl && (
                <>
                  {' • '}
                  {isLoadingYoutube ? (
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Loading YouTube subtitles...
                    </span>
                  ) : youtubeError ? (
                    <span className="text-red-400">YouTube subtitles failed</span>
                  ) : (
                    `${youtubeSubtitles.length} YouTube subtitles`
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">{/* Audio selection removed - handled by separate AudioReencodeModal */}

            {/* Primary Subtitle Selection */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <Subtitles className="w-5 h-5 text-green-400" />
                <h3 className="text-white font-medium">Primary Subtitle</h3>
                <span className="text-gray-400 text-sm">
                  (Learning language - will be analyzed)
                </span>
              </div>
              
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {/* None option */}
                <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="primarySubtitle"
                    checked={selectedPrimarySubtitle === null}
                    onChange={() => handlePrimarySubtitleChange(null, null)}
                    className="w-4 h-4 text-green-600 bg-gray-600 border-gray-500"
                  />
                  <span className="text-gray-300 text-sm">None</span>
                </label>
                
                {/* Embedded Subtitles */}
                {subtitleTracks.length > 0 && (
                  <>
                    <div className="text-gray-400 text-xs font-medium px-2 py-1">
                      📁 Embedded Subtitles
                    </div>
                    {subtitleTracks.map((track, index) => (
                      <label key={`primary-embedded-${track.index}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          name="primarySubtitle"
                          checked={selectedPrimarySubtitle === index && selectedPrimaryType === 'embedded'}
                          onChange={() => handlePrimarySubtitleChange(index, 'embedded')}
                          className="w-4 h-4 text-green-600 bg-gray-600 border-gray-500"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getLanguageEmoji(track.language)}
                          <span className="text-white text-sm truncate">
                            {getTrackLabel(track)}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {track.codec.toUpperCase()}
                          </span>
                        </div>
                      </label>
                    ))}
                  </>
                )}
                
                {/* YouTube Subtitles */}
                {isYouTubeUrl && youtubeSubtitles.length > 0 && (
                  <>
                    <div className="text-gray-400 text-xs font-medium px-2 py-1 flex items-center gap-1">
                      <Download className="w-3 h-3" />
                      YouTube Subtitles
                    </div>
                    {youtubeSubtitles.map((subtitle, index) => (
                      <label key={`primary-youtube-${index}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          name="primarySubtitle"
                          checked={selectedPrimarySubtitle === index && selectedPrimaryType === 'youtube'}
                          onChange={() => handlePrimarySubtitleChange(index, 'youtube')}
                          className="w-4 h-4 text-green-600 bg-gray-600 border-gray-500"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getLanguageEmoji(subtitle.language)}
                          <span className="text-white text-sm truncate">
                            {subtitle.name}
                            {subtitle.isAutoGenerated && (
                              <span className="text-yellow-400 text-xs ml-1">[Auto]</span>
                            )}
                          </span>
                          <span className="text-blue-400 text-xs">
                            ONLINE
                          </span>
                        </div>
                      </label>
                    ))}
                  </>
                )}
                
                {/* Loading state for YouTube */}
                {isYouTubeUrl && isLoadingYoutube && (
                  <div className="flex items-center justify-center p-4 text-gray-400">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm">Loading YouTube subtitles...</span>
                  </div>
                )}
                
                {/* Error state for YouTube */}
                {isYouTubeUrl && youtubeError && (
                  <div className="text-center p-4 text-red-400 text-sm">
                    {youtubeError}
                  </div>
                )}
              </div>
            </div>

            {/* Secondary Subtitle Selection */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <Subtitles className="w-5 h-5 text-yellow-400" />
                <h3 className="text-white font-medium">Secondary Subtitle</h3>
                <span className="text-gray-400 text-sm">
                  (Reference - usually English)
                </span>
              </div>
              
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {/* None option */}
                <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="secondarySubtitle"
                    checked={selectedSecondarySubtitle === null}
                    onChange={() => handleSecondarySubtitleChange(null, null)}
                    className="w-4 h-4 text-yellow-600 bg-gray-600 border-gray-500"
                  />
                  <span className="text-gray-300 text-sm">None</span>
                </label>
                
                {/* Embedded Subtitles */}
                {subtitleTracks.length > 0 && (
                  <>
                    <div className="text-gray-400 text-xs font-medium px-2 py-1">
                      📁 Embedded Subtitles
                    </div>
                    {subtitleTracks.map((track, index) => (
                      <label key={`secondary-embedded-${track.index}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          name="secondarySubtitle"
                          checked={selectedSecondarySubtitle === index && selectedSecondaryType === 'embedded'}
                          onChange={() => handleSecondarySubtitleChange(index, 'embedded')}
                          className="w-4 h-4 text-yellow-600 bg-gray-600 border-gray-500"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getLanguageEmoji(track.language)}
                          <span className="text-white text-sm truncate">
                            {getTrackLabel(track)}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {track.codec.toUpperCase()}
                          </span>
                        </div>
                      </label>
                    ))}
                  </>
                )}
                
                {/* YouTube Subtitles */}
                {isYouTubeUrl && youtubeSubtitles.length > 0 && (
                  <>
                    <div className="text-gray-400 text-xs font-medium px-2 py-1 flex items-center gap-1">
                      <Download className="w-3 h-3" />
                      YouTube Subtitles
                    </div>
                    {youtubeSubtitles.map((subtitle, index) => (
                      <label key={`secondary-youtube-${index}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          name="secondarySubtitle"
                          checked={selectedSecondarySubtitle === index && selectedSecondaryType === 'youtube'}
                          onChange={() => handleSecondarySubtitleChange(index, 'youtube')}
                          className="w-4 h-4 text-yellow-600 bg-gray-600 border-gray-500"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getLanguageEmoji(subtitle.language)}
                          <span className="text-white text-sm truncate">
                            {subtitle.name}
                            {subtitle.isAutoGenerated && (
                              <span className="text-yellow-400 text-xs ml-1">[Auto]</span>
                            )}
                          </span>
                          <span className="text-blue-400 text-xs">
                            ONLINE
                          </span>
                        </div>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
          <div className="text-gray-500 text-sm">
            {selectedPrimarySubtitle !== null && `Primary: #${selectedPrimarySubtitle + 1}`}
            {selectedPrimarySubtitle !== null && selectedSecondarySubtitle !== null && ', '}
            {selectedSecondarySubtitle !== null && `Secondary: #${selectedSecondarySubtitle + 1}`}
            {selectedPrimarySubtitle === null && selectedSecondarySubtitle === null && 'No subtitles selected'}
          </div>
          
          <div className="flex gap-3">
            <AwesomeButton type="secondary" onPress={onClose}>
              Cancel
            </AwesomeButton>
            <AwesomeButton 
              type="primary" 
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <div className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Load Subtitles
              </div>
            </AwesomeButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaTrackSelectionModal;
