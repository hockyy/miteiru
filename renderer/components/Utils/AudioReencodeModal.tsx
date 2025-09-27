import React, { useState } from 'react';
import { X, Volume2, Zap, Clock, HardDrive } from 'lucide-react';
import { AwesomeButton } from 'react-awesome-button';
import { MediaTrack } from '../../types/media';

interface AudioReencodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedAudioTrack: number) => void;
  onSkip: () => void;
  fileName: string;
  audioTracks: MediaTrack[];
  currentAppLanguage: string;
}

const AudioReencodeModal: React.FC<AudioReencodeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSkip,
  fileName,
  audioTracks,
  currentAppLanguage
}) => {
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(() => {
    // Find default audio track or use first one
    const defaultTrack = audioTracks.find(track => track.default);
    return defaultTrack ? audioTracks.indexOf(defaultTrack) : 0;
  });

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

  const handleRencode = () => {
    onConfirm(selectedAudioTrack);
  };

  const handlePlayDefault = () => {
    onSkip();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div
        className="bg-gray-900 rounded-lg shadow-xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Multiple Audio Tracks Detected
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* File Info */}
          <div className="text-center mb-4">
            <div className="text-gray-300 text-sm mb-1">Video file:</div>
            <div className="text-white font-medium break-words mb-2">
              {fileName}
            </div>
            <div className="text-gray-400 text-xs">
              Found {audioTracks.length} audio tracks
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
            <div className="text-gray-300 text-sm mb-3">
              This video has multiple audio tracks. You can:
            </div>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white text-sm font-medium">Reencode with Selected Audio</div>
                  <div className="text-gray-400 text-xs">
                    Create a new file with your preferred audio track. Takes time but gives you full control.
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white text-sm font-medium">Play with Default Audio</div>
                  <div className="text-gray-400 text-xs">
                    Start playing immediately with the default audio track.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audio Track Selection */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-white font-medium text-sm">Select Audio Track for Reencoding</h3>
            </div>
            
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {audioTracks.map((track, index) => (
                <label key={track.index} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="audioTrack"
                    checked={selectedAudioTrack === index}
                    onChange={() => setSelectedAudioTrack(index)}
                    className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500"
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

          {/* Warning */}
          <div className="flex items-start gap-2 bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-4">
            <HardDrive className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-yellow-200 text-xs">
              Reencoding will create a new file in the same folder. This process may take several minutes depending on video length.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-between">
          <AwesomeButton type="secondary" onPress={handlePlayDefault}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Play with Default Audio
            </div>
          </AwesomeButton>
          
          <AwesomeButton type="primary" onPress={handleRencode}>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Reencode with Selected Audio
            </div>
          </AwesomeButton>
        </div>
      </div>
    </div>
  );
};

export default AudioReencodeModal;
