import React from 'react';
import { CopyButton } from '../../../Utils/CopyButton';
import {
  MEANING_ACTION_BTN,
  MEANING_KBD,
  MEANING_SECTION,
  MEANING_SECTION_LABEL,
} from '../../meaningBoxTheme';
import { COPY_BUTTON_CLASS } from '../constants';

type QuickActionsSectionProps = {
  meaning: string;
  rubyHtmlContent: string;
  isExportingAnki: boolean;
  onExportAnki: () => void;
  /** The key that copies the sentence on this page; the hint is left out without one. */
  sentenceCopyKey?: string | null;
};

/** Copy shortcuts + Anki export (mirrors W / Shift+W keyboard bindings). */
export const QuickActionsSection = ({
  meaning,
  rubyHtmlContent,
  isExportingAnki,
  onExportAnki,
  sentenceCopyKey = null,
}: QuickActionsSectionProps) => (
  <section className={MEANING_SECTION}>
    <div className={MEANING_SECTION_LABEL}>Quick actions</div>
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <CopyButton
        text={meaning}
        label="Copy word"
        shortcut="W"
        className={COPY_BUTTON_CLASS}
      />
      <CopyButton
        text={rubyHtmlContent}
        label="Copy with reading"
        shortcut="Shift+W"
        className={COPY_BUTTON_CLASS}
      />
      <button
        type="button"
        onClick={onExportAnki}
        disabled={isExportingAnki}
        className={MEANING_ACTION_BTN}
      >
        {isExportingAnki ? 'Exporting…' : 'Export to Anki'}
      </button>
      {sentenceCopyKey && <span className="ml-auto text-[11px] font-medium text-blue-700">
        <kbd className={`${MEANING_KBD} text-[11px]`}>{sentenceCopyKey}</kbd>
        <span className="ml-1.5">copies the sentence with ruby</span>
      </span>}
    </div>
  </section>
);
