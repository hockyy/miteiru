import React, { useState, useEffect } from 'react';
import { X, Volume2, Zap, Clock, HardDrive, Film } from 'lucide-react';
import { AwesomeButton } from 'react-awesome-button';
import { MediaTrack } from '../../types/media';

interface AudioReencodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedAudioTrack: number, convertToX264?: boolean, convertAudioToAac?: boolean) => void;
  onSkip: () => void;
  fileName: string;
  audioTracks: MediaTrack[];
  videoTracks: MediaTrack[];
  currentAppLanguage: string;
}

const AudioReencodeModal: React.FC<AudioReencodeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSkip,
  fileName,
  audioTracks,
  videoTracks,
  currentAppLanguage
}) => {
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(() => {
    // Find default audio track or use first one
    const defaultTrack = audioTracks.find(track => track.default);
    return defaultTrack ? audioTracks.indexOf(defaultTrack) : 0;
  });

  const [convertToX264, setConvertToX264] = useState<boolean>(false);
  const [convertAudioToAac, setConvertAudioToAac] = useState<boolean>(false);

  // Helper functions (defined before useEffect to avoid initialization errors)
  const isHEVC = () => {
    if (!videoTracks || videoTracks.length === 0) return false;
    return videoTracks.some(track => 
      track.codec.toLowerCase().includes('hevc') || 
      track.codec.toLowerCase().includes('h265') ||
      track.codec.toLowerCase().includes('h.265')
    );
  };

  const getPrimaryVideoTrack = () => {
    if (!videoTracks || videoTracks.length === 0) return null;
    return videoTracks.find(track => track.default) || videoTracks[0];
  };

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

  // Reset selections when a new file is analyzed. Keep H.264 conversion opt-in.
  useEffect(() => {
    const defaultTrack = audioTracks.find(track => track.default);
    setSelectedAudioTrack(defaultTrack ? audioTracks.indexOf(defaultTrack) : 0);
    setConvertToX264(false);
    setConvertAudioToAac(false);
  }, [audioTracks, videoTracks]);

  if (!isOpen) return null;

  const handleRencode = () => {
    onConfirm(selectedAudioTrack, convertToX264, convertAudioToAac);
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
            {isHEVC() ? <Film className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            {isHEVC() ? 'Media Processing Options' : 'Multiple Audio Tracks Detected'}
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
            <div className="text-gray-400 text-xs space-y-1">
              <div>Found {audioTracks.length} audio track{audioTracks.length !== 1 ? 's' : ''}</div>
              {isHEVC() && (
                <div className="flex items-center justify-center gap-1">
                  <Film className="w-3 h-3 text-orange-400" />
                  <span className="text-orange-400">HEVC video codec detected</span>
                </div>
              )}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
            <div className="text-gray-300 text-sm mb-3">
              {audioTracks.length > 1 && isHEVC() 
                ? 'This video has multiple audio tracks and uses HEVC codec. You can:'
                : audioTracks.length > 1 
                  ? 'This video has multiple audio tracks. You can:'
                  : isHEVC() 
                    ? 'This video uses HEVC codec. You can:'
                    : 'You can:'
              }
            </div>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-white text-sm font-medium">
                    {audioTracks.length > 1 && isHEVC() 
                      ? 'Fast Remux with Selected Audio' 
                      : audioTracks.length > 1 
                        ? 'Fast Remux with Selected Audio'
                        : isHEVC() 
                          ? 'Keep HEVC or Convert Video'
                          : 'Fast Remux with Selected Audio'
                    }
                  </div>
                  <div className="text-gray-400 text-xs">
                    {audioTracks.length > 1 && isHEVC() 
                      ? 'Create a new MKV with the selected audio while copying streams by default. You can optionally convert video or audio.'
                      : audioTracks.length > 1 
                        ? 'Create a new MKV with your preferred audio track. Audio is copied unless you choose AAC conversion.'
                        : isHEVC() 
                          ? 'Keep the HEVC stream for speed, or convert video to H.264 for broader compatibility.'
                          : 'Create a new MKV with copied media streams.'
                    }
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

          {/* Video Codec Selection */}
          {isHEVC() && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Film className="w-4 h-4 text-orange-400" />
                <h3 className="text-white font-medium text-sm">Video Codec Options</h3>
              </div>
              
              <div className="space-y-2">
                <div className="text-gray-300 text-xs mb-2">
                  Current: {getPrimaryVideoTrack()?.codec?.toUpperCase() || 'Unknown'} (HEVC/H.265)
                </div>
                
                <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={convertToX264}
                    onChange={(e) => setConvertToX264(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm">Convert video to H.264 (x264)</span>
                    <span className="text-green-400 text-xs bg-green-400/10 px-2 py-1 rounded">
                      Better Compatibility
                    </span>
                  </div>
                </label>
                
                <div className="text-gray-400 text-xs pl-7">
                  Leave unchecked to keep the original HEVC stream and finish much faster.
                </div>
              </div>
            </div>
          )}

          {/* Audio Track Selection */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-white font-medium text-sm">
                {audioTracks.length > 1 
                  ? 'Select Audio Track for Remux' 
                  : 'Audio Track'
                }
              </h3>
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

            <div className="mt-4 border-t border-gray-700 pt-3">
              <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={convertAudioToAac}
                  onChange={(e) => setConvertAudioToAac(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded"
                />
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm">Convert selected audio to AAC</span>
                  <span className="text-green-400 text-xs bg-green-400/10 px-2 py-1 rounded">
                    Better Compatibility
                  </span>
                </div>
              </label>
              <div className="text-gray-400 text-xs pl-7">
                Leave unchecked to copy the original audio stream for the fastest output.
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-4">
            <HardDrive className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-yellow-200 text-xs">
              This will create a new MKV file in the same folder. 
              {isHEVC() && convertToX264 
                ? ' Video codec conversion (HEVC->H.264) will significantly increase processing time.'
                : convertAudioToAac
                  ? ' Audio conversion adds some processing time, but avoids video re-encoding.'
                  : ' The default path copies streams instead of re-encoding, so it should be much faster.'
              }
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
              {isHEVC() && convertToX264 ? <Film className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {isHEVC() && convertToX264 
                ? (convertAudioToAac ? 'Convert Audio & Video' : audioTracks.length > 1 ? 'Remux Audio & Convert to H.264' : 'Convert Video to H.264')
                : convertAudioToAac
                  ? 'Remux with AAC Audio'
                : audioTracks.length > 1 
                  ? 'Fast Remux with Selected Audio'
                  : 'Fast Remux Media'
              }
            </div>
          </AwesomeButton>
        </div>
      </div>
    </div>
  );
};

export default AudioReencodeModal;
