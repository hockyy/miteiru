import React from 'react';
import { getLearningLevelColor } from './vocabLevels';
import { COLOR_KEY } from '../../utils/vocabSaveLevels';

/** What the colours of the subtitle words mean: each level's dot and name. */
export const ColorKey = ({ className = '' }: { className?: string }) => (
  <ul aria-label="Word colours" className={`flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/70 ${className}`}>
    {COLOR_KEY.map(({ level, label }) => (
      <li key={level} className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/40"
          style={{ backgroundColor: getLearningLevelColor(level) }}
        />
        {label}
      </li>
    ))}
  </ul>
);
