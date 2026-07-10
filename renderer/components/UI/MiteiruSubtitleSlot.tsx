import React, { ReactNode } from 'react';
import { UI_SUBTITLE_SLOT } from './miteiruUiTheme';

const SUBTITLE_SCOPE_STYLE = `
  .miteiru-subtitle-slot > div {
    position: relative !important;
    width: 100% !important;
    top: auto !important;
    bottom: auto !important;
  }
`;

export interface MiteiruSubtitleSlotProps {
  children: ReactNode;
  /** Extra horizontal padding when a corner action overlaps (live caption). */
  padX?: boolean;
  className?: string;
}

/** Tokenized subtitle preview area used on /learn and live CC. */
export const MiteiruSubtitleSlot: React.FC<MiteiruSubtitleSlotProps> = ({
  children,
  padX = false,
  className = '',
}) => (
  <>
    <style dangerouslySetInnerHTML={{ __html: SUBTITLE_SCOPE_STYLE }} />
    <div className={`${UI_SUBTITLE_SLOT} ${padX ? 'px-14' : ''} ${className}`.trim()}>
      <div className="miteiru-subtitle-slot w-full">{children}</div>
    </div>
  </>
);
