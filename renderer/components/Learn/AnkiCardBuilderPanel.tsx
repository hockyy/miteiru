/** Right-column Anki card builder shell on /learn. Content: AnkiCardBuilderDisplay.tsx */
import React from 'react';
import {SentenceAnkiDraft} from '../../types/sentenceAnki';
import {AnkiCardBuilderDisplay} from './AnkiCardBuilderDisplay';

interface AnkiCardBuilderPanelProps {
  draft: SentenceAnkiDraft | null;
  isBuilding: boolean;
  isOpening: boolean;
  openStatusMessage?: string | null;
  errorMessage?: string;
  onUpdateDraft: (updates: Partial<SentenceAnkiDraft>) => void;
  onOpen: () => void;
  onClose: () => void;
}

export const AnkiCardBuilderPanel: React.FC<AnkiCardBuilderPanelProps> = ({
  draft,
  isBuilding,
  isOpening,
  openStatusMessage,
  errorMessage,
  onUpdateDraft,
  onOpen,
  onClose,
}) => {
  const isVisible = isBuilding || !!draft || !!errorMessage;
  if (!isVisible) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-emerald-50 overflow-hidden">
      <div className="flex justify-between items-center p-4 pb-2 border-b-2 border-emerald-200 flex-shrink-0">
        <h3 className="text-emerald-900 font-bold text-base">Anki Card Builder</h3>
        <button
          onClick={onClose}
          className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm transition-colors"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <AnkiCardBuilderDisplay
          draft={draft}
          isLoading={isBuilding}
          isOpening={isOpening}
          openStatusMessage={openStatusMessage}
          errorMessage={errorMessage}
          onUpdateDraft={onUpdateDraft}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
};
