import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LearningStateType } from '../types';
import { LeftSidebarShell } from './SidebarShell';
import { VocabWordCard, vocabCardId } from './VocabWordCard';
import { getVocabReadingPreview } from './vocabReadingPreview';
import {
  getLocalizedUserNote,
  getUserNoteKey,
  hasUserNoteContent,
  useUserNotes,
} from '../../hooks/useUserNotes';
import { useStoreData } from '../../hooks/useStoreData';
import { DEFAULT_OPENROUTER_MODEL } from '../../utils/openRouterConstants';
import { generateUserNoteWithAI } from '../../utils/generateUserNoteWithAI';
import { ColorKey } from './ColorKey';
import {
  clampWindow,
  closestIndexByTime,
  growWindow,
  windowAround,
  type VocabWindow,
} from './vocabWindow';
import { holdScrollPosition, topWithin, VOCAB_EDGE_MARGIN } from './vocabScroll';

type VocabEntry = [string, LearningStateType];

type VocabSidebarProps = {
  showVocabSidebar: boolean;
  setShowVocabSidebar: (updater: (value: boolean) => boolean) => void;
  lang: string;
  setMeaning: (word: string) => void;
  tokenizeMiteiru: (word: string) => Promise<unknown>;
  refreshTrigger?: unknown;
};

/** The panel's slide-out (SidebarShell's duration-300), after which the cards are taken off the page. */
const CLOSE_ANIMATION_MS = 350;
const LEVEL_LABELS = ['New', 'Learning', 'Known', 'Mastered'];
const NO_WORDS: VocabEntry[] = [];

/**
 * Left sidebar — scrollable list of saved vocabulary for the current language.
 * Opens with the keyboard shortcut bound in useKeyBind (Ctrl+B by default).
 *
 * The words load when the panel opens (and again if one is saved while it is open), and only a
 * window of cards around the word due nearest to now is rendered: see vocabWindow.ts.
 */
const VocabSidebar = ({
  showVocabSidebar,
  setShowVocabSidebar,
  lang,
  setMeaning,
  tokenizeMiteiru,
  refreshTrigger,
}: VocabSidebarProps) => {
  // The loaded words, with the language and save count they were loaded for.
  const [vocab, setVocab] = useState<{ key: string; entries: VocabEntry[] } | null>(null);
  const [loadFailedFor, setLoadFailedFor] = useState<string | null>(null);
  // Null until the window is placed for this opening of the panel.
  const [range, setRange] = useState<VocabWindow | null>(null);
  const [listMounted, setListMounted] = useState(showVocabSidebar);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoverTokens, setHoverTokens] = useState<{ word: string; tokens: unknown } | null>(null);
  const [generatingWord, setGeneratingWord] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  // A card held in place across the next window change, and its top before the change.
  const anchorRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  // Where the panel scrolls once the next window is on the page.
  const scrollTargetRef = useRef<{ word: string } | 'top' | 'bottom' | null>(null);
  const hoveredWordRef = useRef<string | null>(null);
  const { userNotes, setUserNote } = useUserNotes();
  const [openRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel] = useStoreData('openrouter.model', DEFAULT_OPENROUTER_MODEL);

  const dataKey = `${lang}\n${String(refreshTrigger)}`;
  const entries = vocab?.entries ?? NO_WORDS;
  const isFresh = vocab?.key === dataKey;
  const visibleRange = range && clampWindow(range, entries.length);

  // Opening (or switching language) places the window afresh; closing takes the cards off the page
  // once the slide-out is over. A layout effect, so a reopened panel never paints its old window.
  useLayoutEffect(() => {
    if (showVocabSidebar) {
      setListMounted(true);
      setRange(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setListMounted(false), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [showVocabSidebar, lang]);

  // Loading every saved word costs time with large lists, and a word is saved with each level change
  // while watching, so the panel loads only while it is open.
  useEffect(() => {
    if (!showVocabSidebar || !lang || isFresh) {
      return undefined;
    }
    let cancelled = false;
    window.backend.invoke('loadLearningState', lang)
      .then((loadedState: Record<string, LearningStateType> | null) => {
        if (cancelled) {
          return;
        }
        const sorted = Object.entries(loadedState ?? {}).sort(
          (a: VocabEntry, b: VocabEntry) => a[1].updTime - b[1].updTime,
        ) as VocabEntry[];
        setVocab({ key: dataKey, entries: sorted });
        setLoadFailedFor(null);
      })
      .catch((error: unknown) => {
        console.error('Error loading vocabulary:', error);
        if (!cancelled) {
          setLoadFailedFor(dataKey);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showVocabSidebar, lang, dataKey, isFresh]);

  // Each opening starts at the word whose review time is nearest, once the words are up to date.
  useLayoutEffect(() => {
    if (!showVocabSidebar || range !== null || !isFresh) {
      return;
    }
    const index = closestIndexByTime(entries, Date.now());
    scrollTargetRef.current = index >= 0 ? { word: entries[index][0] } : 'top';
    setRange(windowAround(entries.length, index));
  }, [showVocabSidebar, range, isFresh, entries]);

  // After the window changes: keep the held card where it was, then make any pending scroll.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !range) {
      return;
    }
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (anchor?.element.isConnected) {
      holdScrollPosition(container, anchor.element, anchor.top);
    }
    const target = scrollTargetRef.current;
    scrollTargetRef.current = null;
    if (target === 'top') {
      container.scrollTop = 0;
    } else if (target === 'bottom') {
      container.scrollTop = container.scrollHeight;
    } else if (target) {
      const card = document.getElementById(vocabCardId(target.word));
      if (card) {
        container.scrollTop += topWithin(container, card) - (container.clientHeight - card.offsetHeight) / 2;
      }
    }
  }, [range]);

  // Scrolling near either rendered end adds cards there. The observer is rebuilt for each window, and
  // a new observer reports at once, so a fast scroll keeps adding until the end is far enough away.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !range || !listMounted || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const length = entries.length;
    const observer = new IntersectionObserver((observed) => {
      const near = observed.find((entry) => entry.isIntersecting);
      if (!near) {
        return;
      }
      const up = near.target === topSentinelRef.current;
      // Hold the card beside the growing end: everything between it and the visible area stays as it
      // is, so holding it holds the view, whichever end loses cards.
      const edge = up ? near.target.nextElementSibling : near.target.previousElementSibling;
      if (edge instanceof HTMLElement) {
        anchorRef.current = { element: edge, top: topWithin(container, edge) };
      }
      setRange((current) => {
        if (!current) {
          return current;
        }
        const next = growWindow(current, length, up ? 'up' : 'down');
        return next.start === current.start && next.end === current.end ? current : next;
      });
    }, { root: container, rootMargin: VOCAB_EDGE_MARGIN });
    if (topSentinelRef.current) {
      observer.observe(topSentinelRef.current);
    }
    if (bottomSentinelRef.current) {
      observer.observe(bottomSentinelRef.current);
    }
    return () => observer.disconnect();
  }, [range, entries.length, listMounted]);

  // The top and bottom buttons move the window there when it doesn't reach that end yet.
  const scrollToTop = useCallback(() => {
    if (visibleRange && visibleRange.start > 0) {
      scrollTargetRef.current = 'top';
      setRange(windowAround(entries.length, 0));
      return;
    }
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [entries.length, visibleRange]);

  const scrollToBottom = useCallback(() => {
    if (visibleRange && visibleRange.end < entries.length) {
      scrollTargetRef.current = 'bottom';
      setRange(windowAround(entries.length, entries.length - 1));
      return;
    }
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [entries.length, visibleRange]);

  const notesCount = useMemo(
    () => entries.filter(
      ([word]) => hasUserNoteContent(getLocalizedUserNote(userNotes, word, lang)),
    ).length,
    [lang, entries, userNotes],
  );

  const levelSummary = useMemo(
    () => entries.reduce(
      (counts, [, state]) => {
        counts[state.level] = (counts[state.level] ?? 0) + 1;
        return counts;
      },
      {} as Record<number, number>,
    ),
    [entries],
  );

  const handleHoverStart = useCallback(
    async (word: string) => {
      hoveredWordRef.current = word;
      setHoveredWord(word);
      try {
        const tokens = await tokenizeMiteiru(word);
        // Readings can come back out of order when the pointer moves fast: keep only the current word's.
        if (hoveredWordRef.current === word) {
          setHoverTokens({ word, tokens });
        }
      } catch (error) {
        console.error('Could not read the word for its reading preview:', error);
      }
    },
    [tokenizeMiteiru],
  );

  const handleHoverEnd = useCallback(() => {
    hoveredWordRef.current = null;
    setHoveredWord(null);
    setHoverTokens(null);
  }, []);

  const handleGenerateNote = useCallback(async (word: string) => {
    setGeneratingWord(word);
    try {
      const entry = await generateUserNoteWithAI({
        term: word,
        lang,
        openRouterApiKey,
        openRouterModel,
      });
      await setUserNote(getUserNoteKey(word, lang), entry);
    } catch (error) {
      console.error('AI note generation failed:', error);
      alert(`Failed to generate note: ${(error as Error).message}`);
    } finally {
      setGeneratingWord(null);
    }
  }, [lang, openRouterApiKey, openRouterModel, setUserNote]);

  const readingPreview = useMemo(() => {
    if (!hoveredWord || hoverTokens?.word !== hoveredWord || !Array.isArray(hoverTokens.tokens)) {
      return null;
    }
    return getVocabReadingPreview(hoverTokens.tokens, lang);
  }, [hoverTokens, hoveredWord, lang]);

  const subtitleParts = [lang];
  if (vocab) {
    subtitleParts.push(`${entries.length} word${entries.length === 1 ? '' : 's'}`);
  }
  if (notesCount > 0) {
    subtitleParts.push(`${notesCount} with AI notes`);
  }

  const renderList = () => {
    if (!visibleRange) {
      // The words are loading for this opening: an error says so, otherwise the space stays empty.
      return loadFailedFor === dataKey ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-6 text-center text-sm text-white/70">
          Your saved words didn&apos;t load. Close this panel and open it again to retry.
        </p>
      ) : null;
    }
    if (entries.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white/70">No saved words yet.</p>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            Right-click a word in the subtitles, or choose Learning or Known in its popup. Saved words
            show up here and in Flashcards.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 pb-6">
        {visibleRange.start > 0 && <div ref={topSentinelRef} aria-hidden className="h-px shrink-0" />}
        {entries.slice(visibleRange.start, visibleRange.end).map(([word, state]) => (
          <VocabWordCard
            key={word}
            word={word}
            state={state}
            isHovered={hoveredWord === word}
            readingPreview={hoveredWord === word ? readingPreview : null}
            userNote={getLocalizedUserNote(userNotes, word, lang)}
            isGeneratingNote={generatingWord === word}
            onSelect={setMeaning}
            onGenerateNote={handleGenerateNote}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        ))}
        {visibleRange.end < entries.length && <div ref={bottomSentinelRef} aria-hidden className="h-px shrink-0" />}
      </div>
    );
  };

  return (
    <LeftSidebarShell
      showSidebar={showVocabSidebar}
      setShowSidebar={setShowVocabSidebar}
      scrollRef={containerRef}
      onScrollTop={scrollToTop}
      onScrollBottom={scrollToBottom}
      title="Vocabulary"
      subtitle={subtitleParts.join(' · ')}
    >
      <ColorKey className="mb-3" />

      {entries.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {LEVEL_LABELS.map((label, level) => {
            const count = levelSummary[level] ?? 0;
            if (!count) {
              return null;
            }
            return (
              <span
                key={label}
                className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60"
              >
                {count} {label}
              </span>
            );
          })}
          {notesCount > 0 && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
              {notesCount} AI notes
            </span>
          )}
        </div>
      )}

      {listMounted && renderList()}
    </LeftSidebarShell>
  );
};

// The video page re-renders often while playing; the panel only needs to when its own props change.
export default memo(VocabSidebar);
