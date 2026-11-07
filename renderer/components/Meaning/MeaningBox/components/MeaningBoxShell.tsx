import React, { useRef } from 'react';
import { MEANING_BODY, MEANING_SHELL } from '../../meaningBoxTheme';
import { useDialogFocus } from '../../../../hooks/useDialogFocus';
import type { SidebarInsets } from '../types';

type MeaningBoxShellProps = {
  sidebarInsets: SidebarInsets;
  onClose: () => void;
  customComponent?: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
};

/** Full-screen overlay + scrollable card shell. */
export const MeaningBoxShell = ({
  sidebarInsets,
  onClose,
  customComponent,
  header,
  children,
}: MeaningBoxShellProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus moves into the card and returns to the word on close. Esc is already handled by the page.
  useDialogFocus(dialogRef);

  return (
    <div
      onClick={onClose}
      className="fixed bottom-0 z-[20] flex items-center justify-center bg-blue-900/25 p-2 transition-[left,right] duration-300 ease-out"
      style={{
        top: sidebarInsets.top ?? '0',
        left: sidebarInsets.left ?? '0',
        right: sidebarInsets.right ?? '0',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Word meaning"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`${MEANING_SHELL} focus:outline-none`}
      >
        {customComponent}
        {header}
        <div className={MEANING_BODY}>{children}</div>
      </div>
    </div>
  );
};
