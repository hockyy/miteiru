import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LearningStateType } from '../types';
import { LeftSidebarShell } from './SidebarShell';
import { VocabWordCard } from './VocabWordCard';
import { getVocabReadingPreview } from './vocabReadingPreview';

type VocabEntry = [string, LearningStateType];

type VocabSidebarProps = {
  showVocabSidebar: boolean;
  setShowVocabSidebar: (updater: (value: boolean) => boolean) => void;
  lang: string;
  setMeaning: (word: string) => void;
  tokenizeMiteiru: (word: string) => Promise<unknown>;
  refreshTrigger?: unknown;
};

/**
 * Left sidebar — scrollable list of saved vocabulary for the current language.
 * Opens with the keyboard shortcut bound in useKeyBind (Ctrl+B by default).
 */
const VocabSidebar = ({
  showVocabSidebar,
  setShowVocabSidebar,
  lang,
  setMeaning,
  tokenizeMiteiru,
  refreshTrigger,
}: VocabSidebarProps) => {
  const [sortedVocab, setSortedVocab] = useState<VocabEntry[]>([]);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [tokenizedWord, setTokenizedWord] = useState<Record<string, unknown>[] | null>(null);
  const containerRef = useRef<HTMLElement>(null);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  const loadVocabulary = useCallback(async () => {
    try {
      if (!lang) {
        return;
      }
      const loadedState = await window.ipc.invoke('loadLearningState', lang);
      const sorted = Object.entries(loadedState).sort(
        (a: VocabEntry, b: VocabEntry) => a[1].updTime - b[1].updTime,
      ) as VocabEntry[];
      setSortedVocab(sorted);
    } catch (error) {
      console.error('Error loading vocabulary:', error);
    }
  }, [lang]);

  useEffect(() => {
    loadVocabulary();
  }, [lang, loadVocabulary, refreshTrigger]);

  const findClosestWord = useCallback(() => {
    const now = Date.now();
    return sortedVocab.reduce((closest, current) => {
      const closestDiff = Math.abs(closest[1].updTime - now);
      const currentDiff = Math.abs(current[1].updTime - now);
      return currentDiff < closestDiff ? current : closest;
    });
  }, [sortedVocab]);

  // Jump to the word whose review time is nearest when the panel opens.
  useEffect(() => {
    if (!showVocabSidebar || sortedVocab.length === 0) {
      return;
    }
    const closestWord = findClosestWord();
    const wordElement = document.getElementById(`word-${closestWord[0]}`);
    wordElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [showVocabSidebar, sortedVocab, findClosestWord]);

  const handleMouseEnter = useCallback(
    async (word: string) => {
      setHoveredWord(word);
      const tokenized = (await tokenizeMiteiru(word)) as Record<string, unknown>[];
      setTokenizedWord(tokenized);
    },
    [tokenizeMiteiru],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredWord(null);
    setTokenizedWord(null);
  }, []);

  const renderReadingPreview = useCallback(() => {
    if (!tokenizedWord || !Array.isArray(tokenizedWord)) {
      return null;
    }
    return getVocabReadingPreview(tokenizedWord, lang);
  }, [lang, tokenizedWord]);

  const levelSummary = sortedVocab.reduce(
    (counts, [, state]) => {
      counts[state.level] = (counts[state.level] ?? 0) + 1;
      return counts;
    },
    {} as Record<number, number>,
  );

  return (
    <LeftSidebarShell
      showSidebar={showVocabSidebar}
      setShowSidebar={setShowVocabSidebar}
      scrollRef={containerRef}
      onScrollTop={scrollToTop}
      onScrollBottom={scrollToBottom}
      title="Vocabulary"
      subtitle={`${lang} · ${sortedVocab.length} word${sortedVocab.length === 1 ? '' : 's'}`}
    >
      {sortedVocab.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {['New', 'Learning', 'Known', 'Mastered'].map((label, level) => {
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
        </div>
      )}

      {sortedVocab.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white/70">No saved words yet</p>
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            Turn on learning mode and click subtitle words to build your vocabulary list.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pb-6">
          {sortedVocab.map(([word, state]) => (
            <VocabWordCard
              key={word}
              word={word}
              state={state}
              isHovered={hoveredWord === word}
              readingPreview={hoveredWord === word ? renderReadingPreview() : null}
              onClick={() => setMeaning(word)}
              onMouseEnter={() => handleMouseEnter(word)}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </div>
      )}
    </LeftSidebarShell>
  );
};

export default VocabSidebar;
