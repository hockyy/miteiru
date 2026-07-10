/** JLPT level filter for grammar study controls. */
import React, { useCallback } from 'react';
import { Button } from '../Utils/Button';
import { GrammarLevelFilter, JLPT_LEVELS } from '../../types/jpGrammar';
import { MiteiruPanel, UI_SELECT } from '../UI';

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
    <MiteiruPanel
      label="Grammar study"
      headerAction={
        <span className="text-[11px] font-semibold normal-case tracking-normal text-blue-800">
          {isCatalogLoading ? 'Loading…' : `${filteredCount} points`}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="grammar-level-filter"
          value={levelFilter}
          onChange={handleLevelChange}
          disabled={isCatalogLoading}
          className={UI_SELECT}
          aria-label="JLPT level"
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
          size="small"
          onPress={onPickRandom}
          disabled={isCatalogLoading || isPicking || filteredCount === 0}
        >
          {isPicking ? 'Picking…' : 'Random grammar'}
        </Button>
      </div>
    </MiteiruPanel>
  );
};
