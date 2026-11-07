import React, {ReactNode, useId, useRef} from "react";
import {X} from "lucide-react";
import {useDialogFocus} from "../../hooks/useDialogFocus";

interface ModalShellProps {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
  minSizeClassName?: string;
}

export const ModalShell = ({
  title,
  icon,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-2xl",
  minSizeClassName = "min-h-[360px] min-w-[min(92vw,22rem)]"
}: ModalShellProps) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus moves in, Tab stays in, Esc closes, and focus goes back to where it was.
  useDialogFocus(dialogRef, {onEscape: onClose});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-white/10",
          "bg-slate-950/95 text-white shadow-2xl shadow-black/50 resize focus:outline-none",
          maxWidthClassName,
          minSizeClassName
        ].join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <h2 id={titleId} className="flex min-w-0 items-center gap-2 text-lg font-black">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>

        {footer && (
          <div className="border-t border-white/10 bg-white/[0.03] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
