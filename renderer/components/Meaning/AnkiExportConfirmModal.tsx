import React from 'react';
import { createPortal } from 'react-dom';
import { Layers } from 'lucide-react';
import { AnkiExportPreview } from './ankiExport';

interface AnkiExportConfirmModalProps {
  preview: AnkiExportPreview;
  onConfirm: () => void;
  onCancel: () => void;
}

const previewPanelClassName = [
  'rounded-lg border border-white/10 bg-white px-3 py-2 text-blue-950 leading-relaxed',
  '[&_ruby]:ruby-position-over',
  '[&_ruby_rt]:text-[0.55em] [&_ruby_rt]:text-blue-700',
  '[&_hr]:my-2 [&_hr]:border-blue-200',
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4',
  '[&_strong]:font-semibold',
  '[&_span]:leading-snug',
].join(' ');

const AnkiExportPreviewField = ({
  label,
  html,
  compact = false,
}: {
  label: string;
  html: string;
  compact?: boolean;
}) => (
  <div>
    <span className="text-[11px] font-bold uppercase tracking-wide text-white/35">{label}</span>
    {html ? (
      <div
        className={[
          previewPanelClassName,
          compact ? 'mt-1 max-h-36 overflow-y-auto text-sm' : 'mt-1',
        ].join(' ')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    ) : (
      <p className="mt-1 text-sm italic text-white/45">(empty)</p>
    )}
  </div>
);

export const AnkiExportConfirmModal: React.FC<AnkiExportConfirmModalProps> = ({
  preview,
  onConfirm,
  onCancel,
}) => {
  const confirmLabel = preview.mode === 'open' ? 'Export to Anki' : 'Save file';

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-white shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex items-center gap-2 text-lg font-black">
            <Layers className="h-4 w-4 text-blue-300" />
            Export {preview.cardCount} Anki card{preview.cardCount === 1 ? '' : 's'}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {preview.decks.join(' · ')}
          </p>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto p-4">
          {preview.cards.map((card, index) => (
            <div
              key={`${card.deckName}-${index}`}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-200">
                  {card.deckName}
                </span>
                <span className="text-[11px] text-white/40">{card.tags}</span>
              </div>
              <div className="space-y-2 text-sm">
                <AnkiExportPreviewField label="Front" html={card.frontHtml} />
                <AnkiExportPreviewField label="Back" html={card.backHtml} compact />
              </div>
            </div>
          ))}
          {preview.moreCount > 0 && (
            <p className="text-center text-xs text-white/45">
              + {preview.moreCount} more card{preview.moreCount === 1 ? '' : 's'} not shown
            </p>
          )}
        </div>

        <div className="border-t border-white/10 bg-white/[0.03] px-5 py-4">
          <p className="mb-3 text-xs text-white/50">
            {preview.mode === 'open'
              ? 'Saves a TSV import file, reveals it in your file manager, and opens Anki if installed. In Anki use File → Import.'
              : 'Choose where to save the TSV import file for Anki.'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg border border-blue-400/40 bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-400"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
