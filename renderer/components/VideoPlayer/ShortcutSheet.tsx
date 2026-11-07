import React, {useEffect, useMemo} from "react";
import {Keyboard} from "lucide-react";
import {ModalShell} from "../Utils/ModalShell";
import {buildShortcutGroups} from "../../utils/shortcuts";
import {keyCommandDefinitions} from "../../utils/keyCommands";
import {formatKeys} from "../../utils/platform";
import {isTextEntryTarget} from "../../utils/keyboardTargets";

/** The ? key opens and closes the shortcut sheet (not while typing in a field). */
export const useShortcutSheetKey = (toggle: () => void) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
};

type ShortcutSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The language being learned, named where the sheet speaks of the main subtitle. */
  languageName: string;
};

/** Every video-page shortcut in a dialog. The list is built from the same commands as the keys. */
export const ShortcutSheet = ({isOpen, onClose, languageName}: ShortcutSheetProps) => {
  const groups = useMemo(
      () => buildShortcutGroups(keyCommandDefinitions(languageName), {languageName}),
      [languageName]
  );

  // Esc closes the sheet, and only the sheet.
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
      <ModalShell
          title="Keyboard shortcuts"
          icon={<Keyboard className="h-5 w-5 text-yellow-200"/>}
          onClose={onClose}
          maxWidthClassName="max-w-4xl"
          footer={<div className="text-sm text-white/65">
            <kbd className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-xs font-bold text-white">
              {formatKeys(["Ctrl", "Shift", "P"])}
            </kbd>{" "}
            searches all commands. Press <kbd className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-xs font-bold text-white">?</kbd> or Esc to close.
          </div>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
              <section key={group.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <h3 className="mb-2 text-sm font-black text-yellow-200">{group.title}</h3>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map((item) => (
                      <li key={`${group.title}-${item.description}`} className="flex items-start gap-3 text-sm">
                        <kbd className="shrink-0 whitespace-nowrap rounded-md border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs font-bold text-white">
                          {item.keys}
                        </kbd>
                        <span className="min-w-0 text-white/85">{item.description}</span>
                      </li>
                  ))}
                </ul>
              </section>
          ))}
        </div>
      </ModalShell>
  );
};

export default ShortcutSheet;
