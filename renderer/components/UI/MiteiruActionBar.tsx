import React, { ReactNode } from 'react';
import { UI_SECTION, UI_SECTION_BODY } from './miteiruUiTheme';

export interface MiteiruActionBarProps {
  /** Voice select or other top control. */
  top?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Compact toolbar panel: optional full-width control + button grid.
 * Used on /learn middle column; wrap `Button size="small"` children in a grid.
 */
export const MiteiruActionBar: React.FC<MiteiruActionBarProps> = ({
  top,
  children,
  className = '',
}) => (
  <section className={`${UI_SECTION} ${className}`.trim()}>
    <div className={`${UI_SECTION_BODY} space-y-2`}>
      {top}
      <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">{children}</div>
    </div>
  </section>
);
