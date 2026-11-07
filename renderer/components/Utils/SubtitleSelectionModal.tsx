import React from 'react';
import { BookOpen, FileText, Languages } from 'lucide-react';
import { Button } from './Button';
import { SubtitlePreprocessOptions } from '../../types/subtitlePreprocess';
import {ModalShell} from "./ModalShell";
import {ALL_CAPS_OPTION_HINT, ALL_CAPS_OPTION_LABEL, mainSubtitleName, TRANSLATION_NAME} from "../../utils/subtitleLabels";

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
  const mainName = mainSubtitleName(currentAppLanguage);

  return (
    <ModalShell
      title="Load subtitle as…"
      icon={<FileText className="h-4 w-4 text-blue-300" />}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      minSizeClassName="min-h-[380px] min-w-[min(92vw,24rem)]"
    >
          <div className="mb-4 text-center">
            <div className="mb-1 break-words text-base font-medium text-white">{fileName}</div>
            <div className="text-xs text-gray-400">The next episodes go in the same place.</div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-blue-300/20 bg-blue-950/25 p-3 shadow-lg shadow-black/20">
              <div className="mb-1 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-300" />
                <h3 className="text-sm font-medium text-white">{mainName}</h3>
              </div>
              <div className="mb-3 text-xs text-gray-400">
                The language you are learning: readings, meanings and word tracking.
              </div>
              <Button type="primary" onPress={onSelectPrimary} className="w-full text-sm">
                Use as {mainName}
              </Button>
            </div>

            <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3 shadow-lg shadow-black/20">
              <div className="mb-1 flex items-center gap-2">
                <Languages className="h-4 w-4 text-emerald-300" />
                <h3 className="text-sm font-medium text-white">{TRANSLATION_NAME}</h3>
              </div>
              <div className="mb-3 text-xs text-gray-400">
                Shown underneath to read along, with no readings or word tracking. Files named like <code>show.en.srt</code> go here
                on their own.
              </div>
              <Button type="secondary" onPress={onSelectSecondary} className="w-full text-sm">
                Use as {TRANSLATION_NAME.toLowerCase()}
              </Button>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={!!preprocessOptions.titleCaseAllCaps}
              onChange={(event) => onPreprocessOptionsChange({
                ...preprocessOptions,
                titleCaseAllCaps: event.target.checked
              })}
              className="mt-0.5 h-4 w-4 rounded border-gray-500 bg-gray-600 text-blue-600"
            />
            <span>
              {ALL_CAPS_OPTION_LABEL}
              <span className="block text-gray-400">{ALL_CAPS_OPTION_HINT}</span>
            </span>
          </label>
    </ModalShell>
  );
};

export default SubtitleSelectionModal;
