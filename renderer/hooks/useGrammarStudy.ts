import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GrammarLevelFilter,
  GrammarStudyEntry,
  GrammarUserData,
  JpGrammarEntry,
} from '../types/jpGrammar';
import {
  fetchJpGrammarCatalog,
  filterGrammarByLevel,
  getAdjacentGrammar,
  pickRandomGrammar,
} from '../utils/jpGrammarCatalog';

interface UseGrammarStudyOptions {
  enabled: boolean;
  getGrammarNote: (grammarId: string) => GrammarUserData | null;
}

export function useGrammarStudy({ enabled, getGrammarNote }: UseGrammarStudyOptions) {
  const [catalogEntries, setCatalogEntries] = useState<JpGrammarEntry[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<GrammarLevelFilter>('all');
  const [currentEntry, setCurrentEntry] = useState<JpGrammarEntry | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    setIsCatalogLoading(true);
    setCatalogError(null);

    fetchJpGrammarCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setCatalogEntries(catalog.entries);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        console.error('Failed to load grammar catalog:', error);
        setCatalogError(error.message || 'Failed to load grammar catalog.');
        setCatalogEntries([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const filteredEntries = useMemo(
    () => filterGrammarByLevel(catalogEntries, levelFilter),
    [catalogEntries, levelFilter],
  );

  const currentStudyEntry = useMemo((): GrammarStudyEntry | null => {
    if (!currentEntry) {
      return null;
    }

    const userData = getGrammarNote(currentEntry.id);
    const hasUserData =
      Boolean(userData) &&
      (userData.examples.length > 0 ||
        userData.usageNote.trim() ||
        userData.funFact.trim() ||
        userData.relatedGrammar.length > 0);

    return {
      ...currentEntry,
      userData: hasUserData ? userData : null,
    };
  }, [currentEntry, getGrammarNote]);

  const pickRandom = useCallback(() => {
    const picked = pickRandomGrammar(filteredEntries);
    if (picked) {
      setCurrentEntry(picked);
    }
    return picked;
  }, [filteredEntries]);

  const goToAdjacent = useCallback(
    (direction: -1 | 1) => {
      if (!currentEntry) {
        return null;
      }

      const next = getAdjacentGrammar(filteredEntries, currentEntry.id, direction);
      if (next) {
        setCurrentEntry(next);
      }
      return next;
    },
    [currentEntry, filteredEntries],
  );

  const clearCurrent = useCallback(() => {
    setCurrentEntry(null);
  }, []);

  const hasGrammarResult = Boolean(currentEntry);
  const canGoPrevious = useMemo(() => {
    if (!currentEntry) return false;
    const index = filteredEntries.findIndex((entry) => entry.id === currentEntry.id);
    return index > 0;
  }, [currentEntry, filteredEntries]);

  const canGoNext = useMemo(() => {
    if (!currentEntry) return false;
    const index = filteredEntries.findIndex((entry) => entry.id === currentEntry.id);
    return index >= 0 && index < filteredEntries.length - 1;
  }, [currentEntry, filteredEntries]);

  return {
    levelFilter,
    setLevelFilter,
    filteredCount: filteredEntries.length,
    currentStudyEntry,
    isCatalogLoading,
    catalogError,
    hasGrammarResult,
    canGoPrevious,
    canGoNext,
    pickRandom,
    goToAdjacent,
    clearCurrent,
  };
}
