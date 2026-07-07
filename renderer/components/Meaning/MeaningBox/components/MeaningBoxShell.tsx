import React from 'react';
import { MEANING_BODY, MEANING_SHELL } from '../../meaningBoxTheme';
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
}: MeaningBoxShellProps) => (
  <div
    onClick={onClose}
    className="fixed bottom-0 top-0 z-[20] flex items-center justify-center bg-blue-900/25 p-2 transition-[left,right] duration-300 ease-out"
    style={{
      left: sidebarInsets.left ?? '0',
      right: sidebarInsets.right ?? '0',
    }}
  >
    <div
      onClick={(event) => event.stopPropagation()}
      className={MEANING_SHELL}
    >
      {customComponent}
      {header}
      <div className={MEANING_BODY}>{children}</div>
    </div>
  </div>
);
