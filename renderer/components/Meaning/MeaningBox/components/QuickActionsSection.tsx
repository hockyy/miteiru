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
};

/** Copy shortcuts + Anki export (mirrors W / Shift+W keyboard bindings). */
export const QuickActionsSection = ({
  meaning,
  rubyHtmlContent,
  isExportingAnki,
  onExportAnki,
}: QuickActionsSectionProps) => (
  <section className={MEANING_SECTION}>
    <div className={MEANING_SECTION_LABEL}>Quick actions</div>
    <div className="space-y-3 px-4 py-3 text-sm">
      <div className="flex flex-col gap-1.5 text-sm font-medium text-blue-900">
        <div>
          <kbd className={MEANING_KBD}>W</kbd>
          <span className="ml-2">Copy word</span>
          <span className="ml-1 font-mono font-bold text-blue-950">{meaning}</span>
        </div>
        <div>
          <kbd className={MEANING_KBD}>Shift+W</kbd>
          <span className="ml-2">Copy word with reading</span>
        </div>
        <p className="text-xs text-blue-700">
          <kbd className={`${MEANING_KBD} text-[11px]`}>Ctrl+G</kbd>
          <span className="ml-1.5">copies the full sentence with ruby</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={meaning} label="Copy word" className={COPY_BUTTON_CLASS} />
        <CopyButton
          text={rubyHtmlContent}
          label="Copy with reading"
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
      </div>
    </div>
  </section>
);
