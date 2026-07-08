/** JLPT level filter for grammar study controls. */
import React, { useCallback } from 'react';
import { Button } from '../Utils/Button';
import { GrammarLevelFilter, JLPT_LEVELS } from '../../types/jpGrammar';

interface GrammarStudyControlsProps {
  levelFilter: GrammarLevelFilter;
  filteredCount: number;
  isCatalogLoading: boolean;
  isPicking: boolean;
  onLevelFilterChange: (level: GrammarLevelFilter) => void;
  onPickRandom: () => void;
}

export const GrammarStudyControls: React.FC<GrammarStudyControlsProps> = ({
  levelFilter,
  filteredCount,
  isCatalogLoading,
  isPicking,
  onLevelFilterChange,
  onPickRandom,
}) => {
  const handleLevelChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onLevelFilterChange(event.target.value as GrammarLevelFilter);
    },
    [onLevelFilterChange],
  );

  return (
    <div className="space-y-3 rounded-lg border-2 border-indigo-200 bg-indigo-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-indigo-900">Grammar study</h4>
        <span className="text-xs text-indigo-600">
          {isCatalogLoading ? 'Loading…' : `${filteredCount} points`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-indigo-800" htmlFor="grammar-level-filter">
          Level
        </label>
        <select
          id="grammar-level-filter"
          value={levelFilter}
          onChange={handleLevelChange}
          disabled={isCatalogLoading}
          className="rounded border-2 border-indigo-300 bg-white px-2 py-1 text-xs text-black focus:border-indigo-500 focus:outline-none"
        >
          <option value="all">All levels</option>
          {JLPT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>

        <Button
          type="primary"
          onPress={onPickRandom}
          disabled={isCatalogLoading || isPicking || filteredCount === 0}
        >
          {isPicking ? 'Picking…' : 'Random grammar'}
        </Button>
      </div>
    </div>
  );
};
