/** Right-column Anki card builder shell on /learn. Content: AnkiCardBuilderDisplay.tsx */
import React from 'react';
import {SentenceAnkiDraft} from '../../types/sentenceAnki';
import {MiteiruPanel, UI_ACTION_BTN} from '../UI';
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
    <MiteiruPanel
      fill
      variant="emerald"
      label="Anki Card Builder"
      className="h-full"
      headerAction={
        <button type="button" onClick={onClose} className={UI_ACTION_BTN} title="Close">
          ✕
        </button>
      }
    >
      <AnkiCardBuilderDisplay
        draft={draft}
        isLoading={isBuilding}
        isOpening={isOpening}
        openStatusMessage={openStatusMessage}
        errorMessage={errorMessage}
        onUpdateDraft={onUpdateDraft}
        onOpen={onOpen}
      />
    </MiteiruPanel>
  );
};
