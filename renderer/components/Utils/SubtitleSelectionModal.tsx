import React from 'react';
import { X, FileText, Globe } from 'lucide-react';
import { AwesomeButton } from 'react-awesome-button';

interface SubtitleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrimary: () => void;
  onSelectSecondary: () => void;
  fileName: string;
  currentAppLanguage: string;
}

const SubtitleSelectionModal: React.FC<SubtitleSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectPrimary,
  onSelectSecondary,
  fileName,
  currentAppLanguage
}) => {
  if (!isOpen) return null;

  const getLanguageEmoji = (lang: string) => {
    switch (lang) {
      case 'Japanese': return '🇯🇵';
      case 'Chinese': return '🇨🇳';
      case 'Cantonese': return '🇭🇰';
      case 'Vietnamese': return '🇻🇳';
      case 'English': return '✨';
      default: return '🌐';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div
        className="bg-gray-900 rounded-lg shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Choose Subtitle Type
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1">
          <div className="text-center mb-4">
            <div className="text-gray-300 text-sm mb-1">Loading:</div>
            <div className="text-white font-medium text-base break-words mb-2">
              {fileName}
            </div>
            <div className="text-gray-400 text-xs flex items-center justify-center gap-1">
              <Globe className="w-3 h-3" />
              App language: {getLanguageEmoji(currentAppLanguage)} {currentAppLanguage}
            </div>
          </div>

          <div className="space-y-3">
            {/* Primary Subtitle Option */}
            <div className="bg-gray-800 rounded-md p-3 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-400">📚</span>
                <h3 className="text-white font-medium text-sm">Primary</h3>
              </div>
              <div className="text-gray-400 text-xs mb-3">
                Processed as {currentAppLanguage}, analyzed for learning
              </div>
              <AwesomeButton
                type="primary"
                onPress={onSelectPrimary}
                className="w-full text-sm"
              >
                Load as Primary
              </AwesomeButton>
            </div>

            {/* Secondary Subtitle Option */}
            <div className="bg-gray-800 rounded-md p-3 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-400">🇺🇸</span>
                <h3 className="text-white font-medium text-sm">Secondary</h3>
              </div>
              <div className="text-gray-400 text-xs mb-3">
                Reference only, no analysis
              </div>
              <AwesomeButton
                type="secondary"
                onPress={onSelectSecondary}
                className="w-full text-sm"
              >
                Load as Secondary
              </AwesomeButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubtitleSelectionModal;
