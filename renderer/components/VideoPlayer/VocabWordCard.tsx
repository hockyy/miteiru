import React from 'react';
import { getRelativeTime } from '../../utils/utils';
import type { LearningStateType } from '../types';
import {
  getLearningLevelColor,
  getLearningLevelLabel,
} from './vocabLevels';

type VocabWordCardProps = {
  word: string;
  state: LearningStateType;
  isHovered: boolean;
  readingPreview: React.ReactNode;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** Compact single-row vocabulary entry — fixed height, opacity-only hover. */
export const VocabWordCard = ({
  word,
  state,
  isHovered,
  readingPreview,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: VocabWordCardProps) => {
  const levelColor = getLearningLevelColor(state.level);
  const levelLabel = getLearningLevelLabel(state.level);

  return (
    <button
      type="button"
      id={`word-${word}`}
      title={typeof readingPreview === 'string' ? readingPreview : word}
      className={[
        'unselectable flex h-11 w-full items-center gap-2 rounded-lg border border-white/10',
        'px-2 text-left transition-[background-color,opacity] duration-150',
        'hover:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        isHovered ? 'bg-white/[0.12]' : 'bg-white/[0.06]',
      ].join(' ')}
      style={{ borderLeftWidth: 4, borderLeftColor: levelColor }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="max-w-[34%] shrink-0 truncate text-base font-bold leading-none text-white">
        {word}
      </span>

      {/* Reading slot always reserved so hover never changes row height */}
      <span
        className={[
          'min-w-0 flex-1 truncate text-xs font-medium leading-none text-sky-200 transition-opacity duration-150',
          isHovered && readingPreview ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        aria-hidden={!isHovered || !readingPreview}
      >
        {readingPreview || '\u00a0'}
      </span>

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
  );
};
