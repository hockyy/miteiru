/**
 * Miteiru shared UI kit — MeaningBox-style panels and tokens.
 *
 * Quick start:
 * ```tsx
 * import { MiteiruPanel, UI_TEXTAREA, UI_FIELD_INPUT } from '../components/UI';
 *
 * <MiteiruPanel label="My section">
 *   <textarea className={UI_TEXTAREA} />
 * </MiteiruPanel>
 * ```
 *
 * Full token list and conventions: `./miteiruUiTheme.ts`
 */

export * from './miteiruUiTheme';
export { MiteiruPanel } from './MiteiruPanel';
export type { MiteiruPanelProps } from './MiteiruPanel';
export { MiteiruSubtitleSlot } from './MiteiruSubtitleSlot';
export type { MiteiruSubtitleSlotProps } from './MiteiruSubtitleSlot';
export { MiteiruActionBar } from './MiteiruActionBar';
export type { MiteiruActionBarProps } from './MiteiruActionBar';
