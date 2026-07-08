/** Grammar study card — catalog entry + saved AI notes + actions. */
import React, { useCallback, useMemo } from 'react';
import { Button } from '../Utils/Button';
import { GrammarStudyEntry } from '../../types/jpGrammar';
import { jlptLevelBadgeClass } from '../../utils/jpGrammarCatalog';
import { TranslationVariantRow } from './TranslationVariantRow';

interface GrammarStudyDisplayProps {
  entry: GrammarStudyEntry;
  isGenerating: boolean;
  isAddingExamples: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onGenerateNotes: () => void;
  onAddMoreExamples: () => void;
  onClearNotes: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMoveToAnalyzer: (text: string) => void;
  onCopyExamplesToAnalyzer: (mode: 'replace' | 'append') => void;
  onClose: () => void;
}

export const GrammarStudyDisplay: React.FC<GrammarStudyDisplayProps> = ({
  entry,
  isGenerating,
  isAddingExamples,
  canGoPrevious,
  canGoNext,
  onGenerateNotes,
  onAddMoreExamples,
  onClearNotes,
  onPrevious,
  onNext,
  onMoveToAnalyzer,
  onCopyExamplesToAnalyzer,
  onClose,
}) => {
  const exampleText = useMemo(
    () =>
      (entry.userData?.examples ?? [])
        .map((example) => example.sentence.trim())
        .filter(Boolean)
        .join('\n'),
    [entry.userData?.examples],
  );

  const hasSavedNotes = Boolean(entry.userData);
  const hasExamples = exampleText.length > 0;

  const handleCopyReplace = useCallback(() => {
    onCopyExamplesToAnalyzer('replace');
  }, [onCopyExamplesToAnalyzer]);

  const handleCopyAppend = useCallback(() => {
    onCopyExamplesToAnalyzer('append');
  }, [onCopyExamplesToAnalyzer]);

  return (
    <article className="rounded-lg border-2 border-indigo-300 bg-indigo-50/50 overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 py-2 bg-indigo-100 border-b border-indigo-200">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${jlptLevelBadgeClass[entry.level]}`}
            >
              {entry.level}
            </span>
            <span className="text-xs text-indigo-600">#{entry.index}</span>
          </div>
          <h4 className="text-base font-bold text-indigo-950 break-words">{entry.form}</h4>
          {entry.reading && (
            <p className="text-sm text-indigo-700 mt-0.5">{entry.reading}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-200 rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm transition-colors shrink-0"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-3">
        <p className="text-sm text-indigo-900">{entry.meaning}</p>

        {entry.source && (
          <p className="text-[11px] text-indigo-500">Source: {entry.source}</p>
        )}

        {hasSavedNotes ? (
          <div className="space-y-3 border-t border-indigo-200 pt-3">
            {entry.userData?.usageNote && (
              <section>
                <h5 className="text-xs font-bold text-indigo-800 mb-1">Usage</h5>
                <p className="text-sm text-indigo-900">{entry.userData.usageNote}</p>
              </section>
            )}

            {entry.userData?.examples && entry.userData.examples.length > 0 && (
              <section>
                <h5 className="text-xs font-bold text-indigo-800 mb-2">Examples</h5>
                <div className="space-y-2">
                  {entry.userData.examples.map((example, index) => (
                    <TranslationVariantRow
                      key={`${example.sentence}-${index}`}
                      label={`Example ${index + 1}`}
                      variant={{
                        text: example.sentence,
                        pronunciation: example.meaning,
                      }}
                      pronunciationLabel="Meaning"
                      onMoveToAnalyzer={onMoveToAnalyzer}
                    />
                  ))}
                </div>
              </section>
            )}

            {entry.userData?.funFact && (
              <section className="rounded border-l-4 border-amber-400 bg-amber-50 px-2 py-1.5">
                <h5 className="text-xs font-bold text-amber-900 mb-1">Fun fact</h5>
                <p className="text-sm text-amber-950">{entry.userData.funFact}</p>
              </section>
            )}

            {entry.userData?.relatedGrammar && entry.userData.relatedGrammar.length > 0 && (
              <section>
                <h5 className="text-xs font-bold text-indigo-800 mb-1">Related</h5>
                <div className="flex flex-wrap gap-1">
                  {entry.userData.relatedGrammar.map((related) => (
                    <span
                      key={related}
                      className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800"
                    >
                      {related}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <p className="text-xs text-indigo-600 italic border-t border-indigo-200 pt-3">
            No saved notes yet — generate examples and usage below.
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-indigo-200 pt-3">
          <Button
            type="primary"
            onPress={onGenerateNotes}
            disabled={isGenerating || isAddingExamples}
          >
            {isGenerating ? 'Generating…' : hasSavedNotes ? 'Regenerate notes' : 'Generate notes'}
          </Button>

          <Button
            type="secondary"
            onPress={onAddMoreExamples}
            disabled={isGenerating || isAddingExamples || !hasSavedNotes}
          >
            {isAddingExamples ? 'Adding…' : 'Add more examples'}
          </Button>

          {hasSavedNotes && (
            <Button type="secondary" onPress={onClearNotes} disabled={isGenerating}>
              Clear notes
            </Button>
          )}
        </div>

        {hasExamples && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReplace}
              className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs text-indigo-800 hover:bg-indigo-100 transition-colors"
            >
              Send all to analyzer
            </button>
            <button
              type="button"
              onClick={handleCopyAppend}
              className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs text-indigo-800 hover:bg-indigo-100 transition-colors"
            >
              Append all to analyzer
            </button>
          </div>
        )}

        <div className="flex justify-between pt-1">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className="text-xs text-indigo-700 hover:text-indigo-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            className="text-xs text-indigo-700 hover:text-indigo-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </article>
  );
};
