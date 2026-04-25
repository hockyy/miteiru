import React from 'react';
import { FileText, Globe } from 'lucide-react';
import { AwesomeButton } from 'react-awesome-button';
import { SubtitlePreprocessOptions } from '../../types/subtitlePreprocess';
import {getLanguageEmoji} from "../../utils/mediaUtils";
import {ModalShell} from "./ModalShell";

interface SubtitleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrimary: () => void;
  onSelectSecondary: () => void;
  fileName: string;
  currentAppLanguage: string;
  preprocessOptions: SubtitlePreprocessOptions;
  onPreprocessOptionsChange: (options: SubtitlePreprocessOptions) => void;
}

const SubtitleSelectionModal: React.FC<SubtitleSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectPrimary,
  onSelectSecondary,
  fileName,
  currentAppLanguage,
  preprocessOptions,
  onPreprocessOptionsChange
}) => {
  if (!isOpen) return null;

  return (
    <ModalShell
      title="Choose Subtitle Type"
      icon={<FileText className="h-4 w-4 text-blue-300" />}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      minSizeClassName="min-h-[420px] min-w-[min(92vw,24rem)]"
    >
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

          <div className="bg-gray-800 rounded-md p-3 border border-gray-700 mb-3">
            <div className="text-gray-300 text-xs font-medium mb-2">
              Preprocessor
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!preprocessOptions.titleCaseAllCaps}
                onChange={(event) => onPreprocessOptionsChange({
                  ...preprocessOptions,
                  titleCaseAllCaps: event.target.checked
                })}
                className="mt-0.5 w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded"
              />
              <span className="text-gray-300 text-xs">
                Fix all-caps subtitles to sentence case
              </span>
            </label>
          </div>

          <div className="space-y-3">
            {/* Primary Subtitle Option */}
            <div className="rounded-xl border border-blue-300/20 bg-blue-950/25 p-3 shadow-lg shadow-black/20">
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
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3 shadow-lg shadow-black/20">
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
    </ModalShell>
  );
};

export default SubtitleSelectionModal;
