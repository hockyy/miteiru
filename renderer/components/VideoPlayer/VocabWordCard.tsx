import React from 'react';
import { getRelativeTime } from '../../utils/utils';
import type { LearningStateType } from '../types';
import type { VocabNotePreview } from './vocabNotePreview';
import {
  getLearningLevelColor,
  getLearningLevelLabel,
} from './vocabLevels';

type VocabWordCardProps = {
  word: string;
  state: LearningStateType;
  isHovered: boolean;
  readingPreview: React.ReactNode;
  hasNotes: boolean;
  notePreview: VocabNotePreview | null;
  isGeneratingNote: boolean;
  onClick: () => void;
  onGenerateNote: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** Vocabulary row with optional AI note preview and generate shortcut. */
export const VocabWordCard = ({
  word,
  state,
  isHovered,
  readingPreview,
  hasNotes,
  notePreview,
  isGeneratingNote,
  onClick,
  onGenerateNote,
  onMouseEnter,
  onMouseLeave,
}: VocabWordCardProps) => {
  const levelColor = getLearningLevelColor(state.level);
  const levelLabel = getLearningLevelLabel(state.level);

  return (
    <div
      className={[
        'overflow-hidden rounded-lg border border-white/10 transition-[background-color,border-color] duration-150',
        isHovered ? 'border-white/15 bg-white/[0.1]' : 'bg-white/[0.06]',
      ].join(' ')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        id={`word-${word}`}
        title={typeof readingPreview === 'string' ? readingPreview : word}
        className={[
          'unselectable flex min-h-11 w-full items-center gap-2 px-2 py-2 text-left',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30',
        ].join(' ')}
        style={{ borderLeftWidth: 4, borderLeftColor: levelColor }}
        onClick={onClick}
      >
        <span className="max-w-[30%] shrink-0 truncate text-base font-bold leading-none text-white">
          {word}
        </span>

        <span
          className={[
            'min-w-0 flex-1 truncate text-xs font-medium leading-none text-sky-200 transition-opacity duration-150',
            isHovered && readingPreview ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          aria-hidden={!isHovered || !readingPreview}
        >
          {readingPreview || '\u00a0'}
        </span>

        {hasNotes ? (
          <span
            className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-emerald-200"
            title="AI notes saved"
          >
            Notes
          </span>
        ) : null}

        <span className="shrink-0 whitespace-nowrap text-[10px] font-medium leading-none text-white/40">
          {getRelativeTime(state.updTime)}
        </span>

        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-slate-900"
          style={{ backgroundColor: levelColor }}
        >
          {levelLabel}
        </span>
      </button>

      {notePreview && (
        <div className="border-t border-white/10 bg-black/20 px-2.5 py-2">
          {notePreview.definition && (
            <p className="text-xs font-semibold leading-snug text-emerald-100">
              {notePreview.definition}
            </p>
          )}
          {notePreview.usageNote && (
            <p className="mt-1 text-[11px] leading-snug text-white/60">
              {notePreview.usageNote}
            </p>
          )}
          {(notePreview.funFact || notePreview.exampleCount > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {notePreview.funFact && (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-100">
                  {notePreview.funFact}
                </span>
              )}
              {notePreview.exampleCount > 0 && (
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/45">
                  {notePreview.exampleCount} example{notePreview.exampleCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end border-t border-white/10 bg-white/[0.03] px-2 py-1.5">
        <button
          type="button"
          title={hasNotes ? 'Regenerate AI notes' : 'Generate AI notes'}
          disabled={isGeneratingNote}
          className={[
            'rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors',
            isGeneratingNote
              ? 'cursor-wait border-white/10 bg-white/5 text-white/35'
              : 'border-violet-400/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25',
          ].join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            onGenerateNote();
          }}
        >
          {isGeneratingNote ? 'Generating…' : hasNotes ? 'Regenerate AI' : 'AI notes'}
        </button>
      </div>
    </div>
  );
};
