import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LearningStateType } from '../types';
import { LeftSidebarShell, SIDEBAR_FIELD_INPUT } from './SidebarShell';
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
import { firstVisibleIndex, holdScrollPosition, topWithin, VOCAB_EDGE_MARGIN } from './vocabScroll';
import {
  filterVocab,
  isFiltering,
  NO_VOCAB_FILTER,
  type VocabFilter,
  type VocabLevelFilter,
} from './vocabFilter';

type VocabEntry = [string, LearningStateType];

type VocabSidebarProps = {
  showVocabSidebar: boolean;
  setShowVocabSidebar: (updater: (value: boolean) => boolean) => void;
  lang: string;
  setMeaning: (word: string) => void;
  tokenizeMiteiru: (word: string) => Promise<unknown>;
  refreshTrigger?: unknown;
  // False until the page knows its language, so "no language" isn't shown for a moment at startup.
  languageLoaded?: boolean;
};

/** The panel's slide-out (SidebarShell's duration-300), after which the cards are taken off the page. */
const CLOSE_ANIMATION_MS = 350;
const LEVEL_LABELS = ['New', 'Learning', 'Known', 'Mastered'];
const NO_WORDS: VocabEntry[] = [];
/** How often the cards' "5 minutes ago" is brought up to date while the panel is open. */
const CLOCK_TICK_MS = 30_000;

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
  languageLoaded = true,
}: VocabSidebarProps) => {
  // The loaded words, with the language and save count they were loaded for.
  const [vocab, setVocab] = useState<{ key: string; entries: VocabEntry[] } | null>(null);
  const [loadFailedFor, setLoadFailedFor] = useState<string | null>(null);
  // Null until the window is placed for this opening of the panel.
  const [range, setRange] = useState<VocabWindow | null>(null);
  const [listMounted, setListMounted] = useState(showVocabSidebar);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoverTokens, setHoverTokens] = useState<{ word: string; tokens: unknown } | null>(null);
  // The words whose AI notes are being generated, so each shows "Generating…" and can't be asked twice.
  const [generatingWords, setGeneratingWords] = useState<ReadonlySet<string>>(() => new Set());
  const generatingRef = useRef(new Set<string>());
  // What the cards' relative times count from.
  const [now, setNow] = useState(() => Date.now());
  // The search box and the level chips (vocabFilter.ts); kept while the panel is closed.
  const [filter, setFilter] = useState<VocabFilter>(NO_VOCAB_FILTER);
  const containerRef = useRef<HTMLElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The card at the top of the visible area and where it sits, kept up to date while scrolling, so a
  // change above the view that leaves the window alone (a save, a taller note) can be held too.
  const topCardRef = useRef<{ element: HTMLElement; top: number } | null>(null);
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
  const filtering = isFiltering(filter);
  // What the list shows: every saved word, or what the search and chips keep. The window is over this.
  const shown = useMemo(
    () => filterVocab(
      entries,
      filter,
      (word) => getLocalizedUserNote(userNotes, word, lang)?.definition,
      (word) => hasUserNoteContent(getLocalizedUserNote(userNotes, word, lang)),
    ),
    [entries, filter, userNotes, lang],
  );
  const visibleRange = range && clampWindow(range, shown.length);

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

  // The cards are memoized, so their times only change when this does.
  useEffect(() => {
    if (!showVocabSidebar) {
      return undefined;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [showVocabSidebar]);

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
        // Each save reloads the words: count the times from now, so the word just saved says "Just now".
        setNow(Date.now());
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

  // A new search or chip shows what it found from the top (the effect below places the window).
  useLayoutEffect(() => {
    setRange(null);
  }, [filter]);

  // Each opening starts at the word whose review time is nearest, once the words are up to date;
  // with a search or chip on, at the top of what it found.
  useLayoutEffect(() => {
    if (!showVocabSidebar || range !== null || !isFresh) {
      return;
    }
    const index = filtering ? 0 : closestIndexByTime(shown, Date.now());
    scrollTargetRef.current = !filtering && index >= 0 ? { word: shown[index][0] } : 'top';
    setRange(windowAround(shown.length, index));
  }, [showVocabSidebar, range, isFresh, shown, filtering]);

  const recordTopCard = useCallback(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (!container || !list) {
      topCardRef.current = null;
      return;
    }
    // The sentinels at either end of the list aren't cards.
    const first = topSentinelRef.current ? 1 : 0;
    const count = list.children.length - first - (bottomSentinelRef.current ? 1 : 0);
    const viewTop = container.getBoundingClientRect().top;
    const index = firstVisibleIndex(
      count,
      (i) => list.children[first + i].getBoundingClientRect().bottom,
      viewTop,
    );
    const element = list.children[first + Math.min(index, count - 1)];
    topCardRef.current = element instanceof HTMLElement && count > 0
      ? { element, top: topWithin(container, element) }
      : null;
  }, []);

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
    recordTopCard();
  }, [range, recordTopCard]);

  // Cards above the view can change while the window stays put: a saved word lands above it, a level
  // change moves a card, a note makes one taller. Hold the card at the top of the view through that.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const recorded = topCardRef.current;
    if (!container || !showVocabSidebar || !range || scrollTargetRef.current || !recorded?.element.isConnected) {
      return;
    }
    holdScrollPosition(container, recorded.element, recorded.top);
    recordTopCard();
    // Only the words shown and their notes matter (without a search, `shown` keeps its identity when a
    // note arrives); the window's own changes are held by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, userNotes]);

  // Notes the card at the top of the visible area. The cards are in order, so a search finds it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !listMounted) {
      return undefined;
    }
    container.addEventListener('scroll', recordTopCard, { passive: true });
    return () => container.removeEventListener('scroll', recordTopCard);
  }, [listMounted, recordTopCard]);

  // Scrolling near either rendered end adds cards there. The observer is rebuilt for each window, and
  // a new observer reports at once, so a fast scroll keeps adding until the end is far enough away.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !range || !listMounted || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const length = shown.length;
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
  }, [range, shown.length, listMounted]);

  // The top and bottom buttons move the window there when it doesn't reach that end yet.
  const scrollToTop = useCallback(() => {
    if (visibleRange && visibleRange.start > 0) {
      scrollTargetRef.current = 'top';
      setRange(windowAround(shown.length, 0));
      return;
    }
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [shown.length, visibleRange]);

  const scrollToBottom = useCallback(() => {
    if (visibleRange && visibleRange.end < shown.length) {
      scrollTargetRef.current = 'bottom';
      setRange(windowAround(shown.length, shown.length - 1));
      return;
    }
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [shown.length, visibleRange]);

  // A chip filters to its level; pressing the one that's on shows everything again.
  const toggleLevel = useCallback((level: VocabLevelFilter) => {
    setFilter((current) => ({ ...current, level: current.level === level ? null : level }));
  }, []);

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
    // The guard reads a ref, not the state, so this callback stays the same for every card (memo).
    if (generatingRef.current.has(word)) {
      return;
    }
    generatingRef.current.add(word);
    setGeneratingWords(new Set(generatingRef.current));
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
      generatingRef.current.delete(word);
      setGeneratingWords(new Set(generatingRef.current));
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
    if (languageLoaded && !lang) {
      return (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white/70">
            Choose the language you’re learning on Home to see your saved words.
          </p>
        </div>
      );
    }
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
    if (shown.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-white/70">No saved words match.</p>
          <button
            type="button"
            className="mt-3 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/20"
            onClick={() => setFilter(NO_VOCAB_FILTER)}
          >
            Show all words
          </button>
        </div>
      );
    }
    return (
      <div ref={listRef} className="flex flex-col gap-2 pb-6">
        {visibleRange.start > 0 && <div ref={topSentinelRef} aria-hidden className="h-px shrink-0" />}
        {shown.slice(visibleRange.start, visibleRange.end).map(([word, state]) => (
          <VocabWordCard
            key={word}
            word={word}
            state={state}
            isHovered={hoveredWord === word}
            readingPreview={hoveredWord === word ? readingPreview : null}
            userNote={getLocalizedUserNote(userNotes, word, lang)}
            isGeneratingNote={generatingWords.has(word)}
            now={now}
            onSelect={setMeaning}
            onGenerateNote={handleGenerateNote}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        ))}
        {visibleRange.end < shown.length && <div ref={bottomSentinelRef} aria-hidden className="h-px shrink-0" />}
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
        <>
          <input
            type="search"
            value={filter.query}
            onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
            placeholder="Find a word, or a meaning from its AI notes"
            aria-label="Find a saved word"
            spellCheck={false}
            autoComplete="off"
            className={`${SIDEBAR_FIELD_INPUT} mb-2 w-full`}
          />
          {/* The chips count each level, and filter the list to it when pressed. */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {LEVEL_LABELS.map((label, level) => {
              const count = levelSummary[level] ?? 0;
              if (!count) {
                return null;
              }
              const on = filter.level === level;
              return (
                <button
                  type="button"
                  key={label}
                  aria-pressed={on}
                  title={on ? 'Show every level' : `Show only ${label} words`}
                  onClick={() => toggleLevel(level)}
                  className={[
                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                    on
                      ? 'border-white/60 bg-white/85 text-slate-900'
                      : 'border-white/10 bg-white/[0.08] text-white/60 hover:bg-white/[0.16] hover:text-white/80',
                  ].join(' ')}
                >
                  {count.toLocaleString()} {label}
                </button>
              );
            })}
            {notesCount > 0 && (
              <button
                type="button"
                aria-pressed={filter.level === 'notes'}
                title={filter.level === 'notes' ? 'Show every word' : 'Show only words with AI notes'}
                onClick={() => toggleLevel('notes')}
                className={[
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                  filter.level === 'notes'
                    ? 'border-emerald-200 bg-emerald-200 text-emerald-950'
                    : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25',
                ].join(' ')}
              >
                {notesCount.toLocaleString()} AI notes
              </button>
            )}
          </div>
          <div className="mb-3 min-h-4 text-xs text-white/60" aria-live="polite">
            {filtering && (
              <>
                {shown.length === entries.length ? 'All' : shown.length.toLocaleString()} of {entries.length.toLocaleString()} words
                {' · '}
                <button type="button" className="underline hover:text-white" onClick={() => setFilter(NO_VOCAB_FILTER)}>
                  Clear
                </button>
              </>
            )}
          </div>
        </>
      )}

      {listMounted && renderList()}
    </LeftSidebarShell>
  );
};

// The video page re-renders often while playing; the panel only needs to when its own props change.
export default memo(VocabSidebar);
