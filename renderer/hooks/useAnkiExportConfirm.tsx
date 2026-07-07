import React, { useCallback, useState } from 'react';
import { AnkiExportConfirmModal } from '../components/Meaning/AnkiExportConfirmModal';
import { AnkiExportMode, buildAnkiExportPreview } from '../components/Meaning/ankiExport';

type ConfirmRequest = {
  cards: Array<{
    deckName: string;
    tags: string;
    front: string;
    back: string;
  }>;
  mode: AnkiExportMode;
  resolve: (confirmed: boolean) => void;
};

export function useAnkiExportConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirmExport = useCallback((cards: ConfirmRequest['cards'], mode: AnkiExportMode) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ cards, mode, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    request?.resolve(true);
    setRequest(null);
  }, [request]);

  const handleCancel = useCallback(() => {
    request?.resolve(false);
    setRequest(null);
  }, [request]);

  const modal = request ? (
    <AnkiExportConfirmModal
      preview={buildAnkiExportPreview(request.cards, request.mode)}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirmExport, modal };
}
