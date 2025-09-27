import React from 'react';
import { Zap, Clock } from 'lucide-react';

interface ReencodeProgressModalProps {
  isOpen: boolean;
  fileName: string;
  selectedAudioTrack: string;
  progress: string;
}

const ReencodeProgressModal: React.FC<ReencodeProgressModalProps> = ({
  isOpen,
  fileName,
  selectedAudioTrack,
  progress
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div
        className="bg-gray-900 rounded-lg shadow-xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-gray-700">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2 className="text-xl font-semibold text-white">
            Reencoding Video
          </h2>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* File Info */}
          <div className="text-center mb-6">
            <div className="text-gray-300 text-sm mb-2">Processing:</div>
            <div className="text-white font-medium break-words mb-2">
              {fileName}
            </div>
            <div className="text-gray-400 text-xs">
              Selected audio: {selectedAudioTrack}
            </div>
          </div>

          {/* Progress */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-white text-sm font-medium">Progress</span>
            </div>
            
            <div className="text-center">
              <div className="text-blue-400 text-lg font-mono mb-2">
                {progress || 'Starting...'}
              </div>
              
              {/* Animated progress indicator */}
              <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{width: '40%'}}></div>
              </div>
              
              <div className="text-gray-400 text-xs">
                This may take several minutes depending on video length.
                The new file will be saved in the same folder as the original.
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="mt-4 text-center">
            <div className="text-yellow-200 text-xs bg-yellow-900/30 border border-yellow-600/50 rounded p-2">
              ⚠️ Please don't close the app during reencoding
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReencodeProgressModal;
