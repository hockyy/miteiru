import React, { ReactNode } from 'react';
import { MiteiruPanelVariant, UI_PANEL_VARIANTS } from './miteiruUiTheme';

export interface MiteiruPanelProps {
  /** Yellow label bar text. Omit for unlabeled panels. */
  label?: string;
  variant?: MiteiruPanelVariant;
  /** Right side of label row (e.g. link action). */
  headerAction?: ReactNode;
  /** Stretch panel to fill a flex parent; body scrolls. */
  fill?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * MeaningBox-style section: bordered card + optional yellow label bar.
 * See `miteiruUiTheme.ts` for variant guide and conventions.
 */
export const MiteiruPanel: React.FC<MiteiruPanelProps> = ({
  label,
  variant = 'default',
  headerAction,
  fill = false,
  children,
  className = '',
  bodyClassName = '',
}) => {
  const styles = UI_PANEL_VARIANTS[variant];
  const showLabelRow = Boolean(label || headerAction);
  const shellFill = fill ? 'flex min-h-0 flex-col h-full' : '';
  const bodyFill = fill ? 'min-h-0 flex-1 overflow-y-auto' : '';

  return (
    <section className={`${styles.shell} ${shellFill} ${className}`.trim()}>
      {showLabelRow && (
        <div className={`${styles.label} flex shrink-0 items-center justify-between gap-2`.trim()}>
          {label ? <span>{label}</span> : <span />}
          {headerAction}
        </div>
      )}
      <div className={`${styles.body} ${bodyFill} ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
};
