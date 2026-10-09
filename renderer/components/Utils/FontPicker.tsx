import React, {useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {buildFontItems, fontLabel, FontItem, FontOption, listInstalledFonts} from "../../utils/fonts";

interface FontPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: FontOption[];
  label: string;
  /** Dark for the panels over the video, light for the home screen. */
  tone?: "dark" | "light";
  /** Text each font is previewed with. */
  sample?: string;
}

type Item = FontItem;

const LIST_MAX_HEIGHT = 320;

// Where the list goes: under the input, or above it when there is more room there.
type ListPlacement = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const placeBelowOrAbove = (rect: DOMRect): ListPlacement => {
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const base = {left: rect.left, width: rect.width};
  return below >= Math.min(LIST_MAX_HEIGHT, 220) || below >= above
    ? {...base, top: rect.bottom + 4, maxHeight: Math.min(LIST_MAX_HEIGHT, below)}
    : {...base, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(LIST_MAX_HEIGHT, above)};
};

const TONES = {
  dark: {
    input: "border-white/25 bg-white text-blue-950 placeholder:text-blue-400 focus:border-blue-400 focus:ring-blue-300/50",
    list: "border-white/10 bg-slate-900 text-white shadow-black/50",
    group: "text-white/45",
    note: "text-white/50",
    active: "bg-white/15",
  },
  light: {
    input: "border-blue-300 bg-white text-blue-950 placeholder:text-blue-400 focus:border-blue-500 focus:ring-yellow-200",
    list: "border-blue-200 bg-white text-blue-950 shadow-blue-900/15",
    group: "text-blue-500",
    note: "text-blue-700/70",
    active: "bg-blue-50",
  },
};

/**
 * A font choice: recommended fonts first (installed ones only, when the system can list fonts), then
 * the installed fonts matching what is typed, then the typed name itself. Each entry is shown in its
 * own font. The stored value is a CSS font-family stack.
 */
export const FontPicker = ({value, onChange, options, label, tone = "dark", sample = "日本語 中文 Aa"}: FontPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [installed, setInstalled] = useState<string[]>([]);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState<ListPlacement | null>(null);
  const colors = TONES[tone];

  // The list is drawn at the top level (panels clip their content), so it follows the input.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (inputRef.current) setPlacement(placeBelowOrAbove(inputRef.current.getBoundingClientRect()));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && installed.length === 0) listInstalledFonts().then(setInstalled);
  }, [open, installed.length]);

  const items = useMemo(() => buildFontItems(options, installed, query), [installed, options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const choose = useCallback((item: Item | undefined) => {
    if (item) onChange(item.value);
    close();
    inputRef.current?.blur();
  }, [close, onChange]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) event.stopPropagation();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => Math.max(0, Math.min(items.all.length - 1, index + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items.all[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      inputRef.current?.blur();
    }
  };

  const renderGroup = (title: string, group: Item[], offset: number) => group.length > 0 && (
    <li role="presentation">
      <div className={`px-3 pb-1 pt-2 text-[11px] font-bold ${colors.group}`}>{title}</div>
      <ul role="group" aria-label={title}>
        {group.map((item, index) => (
          <li
            key={item.key}
            id={`${listId}-${offset + index}`}
            role="option"
            aria-selected={offset + index === active}
            className={`cursor-pointer px-3 py-1.5 ${offset + index === active ? colors.active : ""}`}
            onMouseEnter={() => setActive(offset + index)}
            // Choose before the input's blur closes the list.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{item.label}</span>
              <span className="shrink-0 text-base" style={{fontFamily: item.value}}>{sample}</span>
            </div>
            {item.note && <div className={`text-[11px] ${colors.note}`}>{item.note}</div>}
          </li>
        ))}
      </ul>
    </li>
  );

  return (
    <div className="relative w-full min-w-0">
      <input
        ref={inputRef}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && items.all.length > 0 ? `${listId}-${active}` : undefined}
        className={`w-full min-w-0 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 ${colors.input}`}
        style={{fontFamily: open ? undefined : value}}
        value={open ? query : fontLabel(value, options)}
        placeholder={open ? "Search, or type any font name" : undefined}
        title={fontLabel(value, options)}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && placement && createPortal(
        <ul id={listId} role="listbox" aria-label={label}
            style={{position: "fixed", ...placement}}
            onMouseDown={(event) => event.preventDefault()}
            className={`z-[300] overflow-y-auto rounded-xl border py-1 shadow-2xl ${colors.list}`}>
          {renderGroup("Recommended", items.recommended, 0)}
          {renderGroup("Installed on this computer", items.others, items.recommended.length)}
          {renderGroup("Other", items.custom, items.recommended.length + items.others.length)}
          {items.all.length === 0 && <li className={`px-3 py-2 text-sm ${colors.note}`}>No fonts match.</li>}
        </ul>,
        document.body
      )}
    </div>
  );
};
