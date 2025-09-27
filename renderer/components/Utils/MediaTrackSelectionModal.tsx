import React, { useState } from 'react';
import { X, FileText, Volume2, Subtitles, Play } from 'lucide-react';
import { AwesomeButton } from 'react-awesome-button';
import { MediaTrack } from '../../types/media';

interface MediaTrackSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: TrackSelection) => void;
  fileName: string;
  subtitleTracks: MediaTrack[];
  currentAppLanguage: string;
}

export interface TrackSelection {
  primarySubtitleTrackIndex: number | null; // null means no primary subtitle
  secondarySubtitleTrackIndex: number | null; // null means no secondary subtitle
}

const MediaTrackSelectionModal: React.FC<MediaTrackSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  subtitleTracks,
  currentAppLanguage
}) => {
  const [selectedPrimarySubtitle, setSelectedPrimarySubtitle] = useState<number | null>(null);
  const [selectedSecondarySubtitle, setSelectedSecondarySubtitle] = useState<number | null>(null);

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

  const handleConfirm = () => {
    const selection: TrackSelection = {
      primarySubtitleTrackIndex: selectedPrimarySubtitle,
      secondarySubtitleTrackIndex: selectedSecondarySubtitle
    };
    
    console.log('[MediaTrackSelectionModal] User confirmed subtitle selection:', selection);
    console.log('[MediaTrackSelectionModal] Selected subtitle tracks details:', {
      primarySub: selectedPrimarySubtitle !== null ? subtitleTracks[selectedPrimarySubtitle] : null,
      secondarySub: selectedSecondarySubtitle !== null ? subtitleTracks[selectedSecondarySubtitle] : null
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
              App language: {getLanguageEmoji(currentAppLanguage)} {currentAppLanguage} • {subtitleTracks.length} embedded subtitles
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
              
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {/* None option */}
                <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="primarySubtitle"
                    checked={selectedPrimarySubtitle === null}
                    onChange={() => setSelectedPrimarySubtitle(null)}
                    className="w-4 h-4 text-green-600 bg-gray-600 border-gray-500"
                  />
                  <span className="text-gray-300 text-sm">None</span>
                </label>
                
                {subtitleTracks.map((track, index) => (
                  <label key={`primary-${track.index}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="primarySubtitle"
                      checked={selectedPrimarySubtitle === index}
                      onChange={() => setSelectedPrimarySubtitle(index)}
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
              
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {/* None option */}
                <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="secondarySubtitle"
                    checked={selectedSecondarySubtitle === null}
                    onChange={() => setSelectedSecondarySubtitle(null)}
                    className="w-4 h-4 text-yellow-600 bg-gray-600 border-gray-500"
                  />
                  <span className="text-gray-300 text-sm">None</span>
                </label>
                
                {subtitleTracks.map((track, index) => (
                  <label key={`secondary-${track.index}`} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="secondarySubtitle"
                      checked={selectedSecondarySubtitle === index}
                      onChange={() => setSelectedSecondarySubtitle(index)}
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
