/**
 * Miteiru UI theme — single source for MeaningBox-style cartoon panels.
 *
 * ## When to use what
 *
 * | Token / component        | Use for |
 * |--------------------------|---------|
 * | `UI_SECTION` + `MiteiruPanel` | Grouped content with optional yellow label bar |
 * | `UI_SECTION_LIVE`        | Live caption blocks (green accent) |
 * | `UI_SECTION_PURPLE` / `EMERALD` | AI analysis / Anki builder columns |
 * | `UI_FIELD_INPUT`         | `<input>`, `<select>`, single-line controls |
 * | `SIDEBAR_FIELD_INPUT`    | Inputs inside dark `SidebarShell` panels |
 * | `Button secondary small` | Show/Hide toggles beside sidebar secret fields |
 * | `UI_TEXTAREA`            | Multi-line text entry |
 * | `UI_ACTION_BTN`          | Compact inline actions (prefer over raw `<button>`) |
 * | `Button` (`Utils/Button`) | Primary/secondary actions in toolbars |
 * | `MiteiruActionBar`       | Voice select + small button grid (learn page pattern) |
 * | `MiteiruSubtitleSlot`    | Tokenized subtitle preview areas |
 *
 * ## Conventions
 *
 * 1. **Do not invent new blues** — extend variants here instead of one-off Tailwind in pages.
 * 2. **Panels** — wrap related controls in `MiteiruPanel`; use `label` for yellow header bar text.
 * 3. **Shadows** — hard offset shadows (`shadow-[2px_2px_0_0_#…]`) match MeaningBox; keep them on section shells only.
 * 4. **Buttons in narrow columns** — use `Button` with `size="small"` or `UI_ACTION_BTN`; paired buttons use `miteiru-btn--fill` (see globals.css).
 * 5. **New page shells** — add `UI_PAGE_*` tokens here, then thin re-export file if the page needs a alias (see `homeMenuTheme.ts`).
 *
 * MeaningBox imports `meaningBoxTheme.ts`, which re-exports `MEANING_*` names from this file.
 */

export type MiteiruPanelVariant = 'default' | 'live' | 'purple' | 'emerald' | 'plain';

/** Page backdrop (home, light screens). */
export const UI_PAGE_BG =
  'min-h-screen w-screen overflow-y-auto bg-gradient-to-b from-blue-50 via-white to-blue-50 px-4 py-4 text-blue-950';

/** Learn / workspace column backdrop. */
export const UI_COLUMN_BG = 'bg-blue-100';

/** Learn left column (AI translation + grammar). */
export const UI_STUDY_COLUMN_BG = 'bg-gradient-to-br from-purple-50 to-pink-50';

/** Top-level card (home menu shell). */
export const UI_SHELL =
  'w-full overflow-hidden rounded-2xl border-2 border-blue-700 bg-blue-100 shadow-[3px_3px_0_0_#1d4ed8]';

/** MeaningBox modal shell (fixed height). */
export const MEANING_SHELL =
  'overflow-auto rounded-2xl border-2 border-blue-700 bg-blue-100 shadow-[3px_3px_0_0_#1d4ed8] w-full max-w-[1200px] h-[80vh] max-h-[90vh] transition-[width,max-width] duration-300 ease-out';

export const MEANING_HEADER =
  'sticky top-0 z-[100] flex flex-col items-center gap-3 border-b-2 border-blue-700 bg-blue-100/95 px-4 py-3 shadow-[0_2px_0_0_rgba(29,78,216,0.12)] backdrop-blur-sm';

export const MEANING_BODY = 'space-y-4 px-4 py-4 text-blue-950';

export const UI_SECTION =
  'overflow-hidden min-w-0 rounded-xl border-2 border-blue-600 bg-white shadow-[2px_2px_0_0_#2563eb]';

export const MEANING_SECTION = UI_SECTION;

export const UI_SECTION_LABEL =
  'border-b-2 border-blue-600 bg-yellow-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-blue-900';

export const MEANING_SECTION_LABEL = UI_SECTION_LABEL;

export const MEANING_SECTION_TITLE =
  'text-xs font-bold uppercase tracking-wide text-blue-900';

export const MEANING_SECTION_HEADER =
  'flex flex-wrap items-start justify-between gap-3 border-b border-blue-600 bg-yellow-200 px-4 py-2';

export const UI_SECTION_BODY = 'min-w-0 bg-white px-3 py-2';

export const UI_SECTION_LIVE =
  'overflow-hidden min-w-0 rounded-xl border-2 border-green-600 bg-green-50 shadow-[2px_2px_0_0_#16a34a]';

export const UI_SECTION_PURPLE =
  'overflow-hidden min-w-0 flex flex-col h-full border-2 border-purple-700 bg-purple-50 shadow-[2px_2px_0_0_#7e22ce]';

export const UI_SECTION_EMERALD =
  'overflow-hidden min-w-0 flex flex-col h-full border-2 border-emerald-700 bg-emerald-50 shadow-[2px_2px_0_0_#047857]';

export const UI_SECTION_LABEL_PURPLE =
  'border-b-2 border-purple-600 bg-yellow-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-purple-950';

export const UI_SECTION_LABEL_EMERALD =
  'border-b-2 border-emerald-600 bg-yellow-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-950';

export const UI_SECTION_LABEL_LIVE =
  'border-b-2 border-green-600 bg-yellow-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-green-900';

export const MEANING_ENTRY =
  'overflow-hidden rounded-xl border border-blue-700 bg-white shadow-[1px_1px_0_0_#1d4ed8]';

export const MEANING_ENTRY_CHARACTER =
  'overflow-hidden rounded-xl border border-red-700 border-l-4 border-l-red-600 bg-red-50 shadow-[1px_1px_0_0_#b91c1c]';

export const MEANING_TAG_ROW = 'flex flex-wrap gap-2 border-b border-blue-600 bg-blue-100 px-4 py-3';

export const MEANING_TAG_ROW_CHARACTER =
  'flex flex-wrap gap-2 border-b border-red-600 bg-red-100 px-4 py-3';

export const MEANING_TAG =
  'rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white unselectable';

export const MEANING_TAG_CHARACTER =
  'rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white unselectable';

export const MEANING_WORD_DISPLAY =
  'inline-flex h-fit w-fit items-center justify-center rounded-xl border-2 border-blue-700 bg-white px-[0.35em] pb-[0.25em] pt-[0.45em] unselectable hovery shadow-[1px_1px_0_0_#1d4ed8] transition-transform duration-150 hover:-translate-y-0.5';

export const MEANING_GLOSS = 'px-4 py-3 text-base font-semibold leading-relaxed text-red-700';

export const MEANING_GLOSS_INDEX = 'font-bold text-blue-800 mr-2';

export const UI_ACTION_BTN =
  'inline-flex min-w-0 max-w-full items-center justify-center gap-1 rounded-lg border border-blue-700 bg-yellow-200 px-2.5 py-1 text-xs font-bold text-blue-900 transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50';

export const MEANING_ACTION_BTN = UI_ACTION_BTN;

export const UI_ACTION_BTN_PRIMARY =
  'inline-flex min-w-0 items-center justify-center rounded-lg border border-blue-700 bg-blue-200 px-2.5 py-1 text-xs font-bold text-blue-900 transition-colors hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-50';

export const UI_ACTION_BTN_LIVE =
  'inline-flex min-w-0 items-center justify-center rounded-lg border border-green-700 bg-green-200 px-2.5 py-1 text-xs font-bold text-green-900 transition-colors hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-50';

export const MEANING_KBD =
  'rounded-md border border-blue-500 bg-yellow-100 px-2 py-0.5 text-xs font-bold text-blue-800';

export const MEANING_NOTE_LABEL =
  'text-xs font-bold uppercase tracking-wide text-blue-900';

export const MEANING_NOTE_DIVIDER = 'border-t border-blue-200';

export const UI_FIELD_INPUT =
  'w-full min-w-0 rounded-lg border-2 border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-950 placeholder:text-blue-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-yellow-200';

export const MEANING_FIELD_INPUT = UI_FIELD_INPUT;

export const UI_TEXTAREA =
  'w-full min-w-0 rounded-lg border-2 border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-950 placeholder:text-blue-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-yellow-200 resize-y min-h-[120px]';

export const UI_SELECT = `${UI_FIELD_INPUT} cursor-pointer text-xs py-1.5`;

export const MEANING_READING_BUBBLE =
  'rounded-lg border border-blue-300 bg-blue-100 px-2 py-0.5 font-medium text-blue-900';

export const MEANING_READING_BUBBLE_CHARACTER =
  'rounded-lg border border-red-300 bg-red-100 px-2 py-0.5 font-medium text-red-800';

export const UI_SUBTITLE_SLOT =
  'relative flex min-h-[48px] items-center justify-center';

export const UI_HINT_TEXT = 'text-xs font-medium text-blue-800';

export const UI_ERROR_BANNER =
  'rounded-lg border-2 border-red-400 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800';

/** Home menu aliases (re-exported via homeMenuTheme.ts). */
export const HOME_PAGE_BG = UI_PAGE_BG;
export const HOME_SHELL = `${UI_SHELL} max-w-4xl rounded-3xl shadow-[0_6px_0_0_#1d4ed8]`;
export const HOME_HEADER =
  'flex flex-row items-center justify-between gap-3 border-b-2 border-blue-700 bg-blue-200 px-4 py-4';
export const HOME_BODY = MEANING_BODY;
export const HOME_SECTION = `${UI_SECTION} rounded-2xl shadow-[0_4px_0_0_#2563eb]`;
export const HOME_SECTION_LABEL = `${UI_SECTION_LABEL} py-2.5`;
export const HOME_STATUS_PILL =
  'max-w-[min(50vw,280px)] truncate rounded-2xl border-2 border-blue-700 bg-yellow-200 px-3 py-1.5 text-[11px] font-bold text-blue-900';
export const HOME_INNER_PANEL =
  'overflow-hidden rounded-2xl border-2 border-blue-500 bg-blue-50 shadow-[0_3px_0_0_#3b82f6]';
export const HOME_INNER_LABEL =
  'border-b-2 border-blue-500 bg-yellow-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-blue-900';
export const HOME_STATUS_CHIP =
  'inline-flex items-center gap-1.5 rounded-2xl border-2 border-blue-600 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-900 shadow-[0_2px_0_0_#2563eb]';
export const HOME_ICON_BADGE =
  'flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-blue-700 bg-yellow-200 text-lg shadow-[0_2px_0_0_#1d4ed8]';

export const UI_PANEL_VARIANTS: Record<MiteiruPanelVariant, { shell: string; label: string; body: string }> = {
  default: { shell: UI_SECTION, label: UI_SECTION_LABEL, body: UI_SECTION_BODY },
  plain: { shell: UI_SECTION, label: '', body: UI_SECTION_BODY },
  live: { shell: UI_SECTION_LIVE, label: UI_SECTION_LABEL_LIVE, body: 'min-w-0 bg-green-50/80 px-3 py-2' },
  purple: { shell: UI_SECTION_PURPLE, label: UI_SECTION_LABEL_PURPLE, body: 'min-w-0 flex-1 overflow-y-auto px-3 py-2' },
  emerald: { shell: UI_SECTION_EMERALD, label: UI_SECTION_LABEL_EMERALD, body: 'min-w-0 flex-1 overflow-y-auto px-3 py-2' },
};
