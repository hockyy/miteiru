import React, {useCallback, useEffect, useRef} from "react";
import {formatKeys} from "../../utils/platform";

type VideoTopBarProps = {
  onHome: () => void;
  onOpenFiles: () => void;
  onShowMyWords: () => void;
  onShowShortcuts: () => void;
  subtitleMenuOpen: boolean;
  setSubtitleMenuOpen: (open: boolean) => void;
  /** Built-in tracks, or YouTube captions, can be chosen. */
  canChooseTracks: boolean;
  isYoutube: boolean;
  onChooseTracks: () => void;
  /** The language being learned ("Japanese"), named where the main subtitle is. */
  languageName: string;
  hasPrimarySubtitle: boolean;
  hasSecondarySubtitle: boolean;
  onRemovePrimary: () => void;
  onRemoveSecondary: () => void;
};

const BAR_BUTTON =
  "rounded-lg px-3 py-1.5 text-sm font-bold text-white/85 transition-colors hover:bg-white/15 hover:text-white " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

const MENU_ITEM =
  "block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/90 transition-colors " +
  "hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

/**
 * The bar across the top of the video page: home, open, subtitles, my words and the shortcut list.
 * It fades with the player controls (`autohide`) and sits between the open side panels.
 */
export const VideoTopBar = ({
  onHome,
  onOpenFiles,
  onShowMyWords,
  onShowShortcuts,
  subtitleMenuOpen,
  setSubtitleMenuOpen,
  canChooseTracks,
  isYoutube,
  onChooseTracks,
  languageName,
  hasPrimarySubtitle,
  hasSecondarySubtitle,
  onRemovePrimary,
  onRemoveSecondary
}: VideoTopBarProps) => {
  // A subtitle shown at the top moves below the bar while the bar shows (globals.css): publish the
  // height of the buttons' row, without the fade under it. The row wraps in a narrow window.
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement.style;
    const publish = () => {
      const fade = parseFloat(getComputedStyle(bar).paddingBottom) || 0;
      root.setProperty("--player-topbar-height", `${Math.max(0, Math.round(bar.getBoundingClientRect().height - fade))}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.removeProperty("--player-topbar-height");
    };
  }, []);

  // A button clicked with the mouse takes no focus, so Space keeps playing and pausing.
  const keepFocusOff = useCallback((event: React.MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
  }, []);

  // Esc closes the menu, and only the menu.
  useEffect(() => {
    if (!subtitleMenuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.stopPropagation();
      setSubtitleMenuOpen(false);
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [subtitleMenuOpen, setSubtitleMenuOpen]);

  // Choosing an item closes the menu.
  const choose = (action: () => void) => () => {
    setSubtitleMenuOpen(false);
    action();
  };

  return <nav
      ref={barRef}
      aria-label="Video"
      onMouseDown={keepFocusOff}
      className="autohide player-topbar fixed top-0 z-[16] flex flex-wrap items-center gap-1 px-3 pb-6 pt-2 unselectable"
      style={{left: "var(--subtitle-inset-left, 0px)", right: "var(--subtitle-inset-right, 0px)"}}>
    <button type="button" className={BAR_BUTTON} onClick={onHome}
            title={`Back to the home page (${formatKeys(["Ctrl", "H"])})`}>
      ← Home
    </button>
    <button type="button" className={BAR_BUTTON} onClick={onOpenFiles}
            title={`Open a video or subtitle file (${formatKeys(["Ctrl", "O"])})`}>
      Open…
    </button>
    <div className="relative">
      <button type="button" className={BAR_BUTTON} aria-haspopup="menu" aria-expanded={subtitleMenuOpen}
              onClick={() => setSubtitleMenuOpen(!subtitleMenuOpen)}
              title="Choose, add or remove subtitles">
        Subtitles…
      </button>
      {subtitleMenuOpen && <>
        {/* A click anywhere else closes the menu. */}
        <div className="fixed inset-0 z-[-1]" onClick={() => setSubtitleMenuOpen(false)}/>
        <div role="menu"
             className="absolute left-0 top-full z-10 mt-1 w-72 max-w-[90vw] rounded-xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {canChooseTracks && <button type="button" role="menuitem" className={MENU_ITEM}
                                      onClick={choose(onChooseTracks)}>
            {isYoutube ? "Choose YouTube captions…" : "Choose subtitles from the video…"}
          </button>}
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={choose(onOpenFiles)}>
            Open a subtitle file…
          </button>
          {(hasPrimarySubtitle || hasSecondarySubtitle) && <div className="my-1 border-t border-white/10"/>}
          {hasPrimarySubtitle && <button type="button" role="menuitem" className={MENU_ITEM}
                                         onClick={choose(onRemovePrimary)}>
            Remove {languageName} subtitle
          </button>}
          {hasSecondarySubtitle && <button type="button" role="menuitem" className={MENU_ITEM}
                                           onClick={choose(onRemoveSecondary)}>
            Remove translation
          </button>}
        </div>
      </>}
    </div>
    <button type="button" className={BAR_BUTTON} onClick={onShowMyWords}
            title={`The words you are learning (${formatKeys(["Ctrl", "X"])})`}>
      My words
    </button>
    <button type="button" className={BAR_BUTTON} onClick={onShowShortcuts} title="Every keyboard shortcut (?)">
      Shortcuts
    </button>
  </nav>;
};

export default VideoTopBar;
