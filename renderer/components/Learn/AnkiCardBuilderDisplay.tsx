/** Editable Anki card preview + export. Hook: hooks/useSentenceAnki.ts */
import React, {useMemo} from 'react';
import {SentenceAnkiDraft} from '../../types/sentenceAnki';
import {
  buildSentenceAnkiBackHtml,
  buildSentenceAnkiFrontHtml,
} from '../Meaning/ankiExport';
import {LearnErrorMessage} from './LearnErrorMessage';
import {CuteLoadingAnimation} from './CuteLoadingAnimation';

interface AnkiCardBuilderDisplayProps {
  draft: SentenceAnkiDraft | null;
  isLoading?: boolean;
  isOpening?: boolean;
  openStatusMessage?: string | null;
  errorMessage?: string;
  onUpdateDraft: (updates: Partial<SentenceAnkiDraft>) => void;
  onOpen: () => void;
}

const fieldClassName =
  'w-full rounded-lg border-2 border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200';

const previewClassName =
  'rounded-lg border-2 border-emerald-200 bg-white p-4 min-h-[4rem] text-gray-900 leading-relaxed';

const SectionLabel: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="mb-2">
    <h4 className="text-sm font-bold text-emerald-900">{title}</h4>
    {hint && <p className="text-xs text-emerald-700 mt-0.5">{hint}</p>}
  </div>
);

export const AnkiCardBuilderDisplay: React.FC<AnkiCardBuilderDisplayProps> = ({
  draft,
  isLoading = false,
  isOpening = false,
  openStatusMessage,
  errorMessage,
  onUpdateDraft,
  onOpen,
}) => {
  const frontPreviewHtml = useMemo(
    () => (draft ? buildSentenceAnkiFrontHtml(draft.frontText) : ''),
    [draft],
  );

  const backPreviewHtml = useMemo(
    () => (draft ? buildSentenceAnkiBackHtml(draft) : ''),
    [draft],
  );

  if (errorMessage && !draft && !isLoading) {
    return <LearnErrorMessage message={errorMessage} />;
  }

  if (isLoading && !draft) {
    return (
      <CuteLoadingAnimation
        message="Building your Anki card..."
        subMessage="Translation, readings, and notes on the way"
      />
    );
  }

  if (!draft) {
    return null;
  }

  return (
    <div className="space-y-5">
      {errorMessage && <LearnErrorMessage message={errorMessage} />}
      {openStatusMessage && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-100 p-3 text-sm text-emerald-900 whitespace-pre-wrap">
          {openStatusMessage}
        </div>
      )}

      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 px-3 py-2 text-xs text-emerald-900">
        Deck: <span className="font-semibold">{draft.deckName}</span>
      </div>

      <section>
        <SectionLabel title="Front" hint="Plain sentence shown on the card front." />
        <textarea
          value={draft.frontText}
          onChange={(event) => onUpdateDraft({ frontText: event.target.value })}
          rows={3}
          className={`${fieldClassName} font-medium`}
          spellCheck={false}
        />
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            Preview
          </p>
          <div
            className={previewClassName}
            dangerouslySetInnerHTML={{ __html: frontPreviewHtml }}
          />
        </div>
      </section>

      <section>
        <SectionLabel title="Back" hint="Edit ruby markup, translation, or notes before exporting." />

        <label className="block mb-3">
          <span className="text-xs font-semibold text-emerald-800">Ruby markup</span>
          <textarea
            value={draft.rubyHtml}
            onChange={(event) => onUpdateDraft({ rubyHtml: event.target.value })}
            rows={4}
            className={`${fieldClassName} mt-1 font-mono text-xs`}
            spellCheck={false}
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-emerald-800">Translation</span>
          <textarea
            value={draft.translation}
            onChange={(event) => onUpdateDraft({ translation: event.target.value })}
            rows={2}
            className={`${fieldClassName} mt-1`}
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-emerald-800">Note</span>
          <textarea
            value={draft.note}
            onChange={(event) => onUpdateDraft({ note: event.target.value })}
            rows={3}
            className={`${fieldClassName} mt-1`}
          />
        </label>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            Preview
          </p>
          <div
            className={previewClassName}
            dangerouslySetInnerHTML={{ __html: backPreviewHtml }}
          />
        </div>
      </section>

      <button
        type="button"
        onClick={onOpen}
        disabled={isOpening || !draft.frontText.trim()}
        className="w-full rounded-lg border-2 border-emerald-400 bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isOpening ? 'Exporting…' : 'Export to Anki'}
      </button>
    </div>
  );
};
