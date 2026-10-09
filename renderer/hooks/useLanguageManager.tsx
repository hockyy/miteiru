import { useCallback } from 'react';
import { useStoreData } from './useStoreData';
import {languageModes} from "../languages/manifest";

export interface LanguageMode {
  id: number;
  name: string;
  channel: string;
  emoji: string;
  description: string;
}

export const LANGUAGE_MODES: LanguageMode[] = languageModes.map(({
  id,
  name,
  channel,
  emoji,
  description
}) => ({
  id,
  name,
  channel,
  emoji,
  description
}));

// MeCab (mode 1) was removed: Kuromoji uses the same IPADIC dictionary without an external install.
const REMOVED_MODE_REPLACEMENTS: Record<number, number> = {1: 0};

const useLanguageManager = () => {
  const [storedLanguageMode, setLastLanguageMode] = useStoreData('app.lastLanguageMode', null);
  const lastLanguageMode = REMOVED_MODE_REPLACEMENTS[storedLanguageMode] ?? storedLanguageMode;

  const setLanguage = useCallback((modeId: number | null) => {
    setLastLanguageMode(modeId);
  }, [setLastLanguageMode]);

  const clearLanguage = useCallback(() => {
    setLastLanguageMode(null);
  }, [setLastLanguageMode]);

  const getLanguageById = useCallback((id: number): LanguageMode | undefined => {
    return LANGUAGE_MODES.find(mode => mode.id === id);
  }, []);

  const hasLastLanguage = useCallback(() => {
    return lastLanguageMode !== null && lastLanguageMode !== undefined;
  }, [lastLanguageMode]);

  const getLastLanguage = useCallback((): LanguageMode | null => {
    if (!hasLastLanguage()) return null;
    return getLanguageById(lastLanguageMode) || null;
  }, [lastLanguageMode, hasLastLanguage, getLanguageById]);

  return {
    lastLanguageMode,
    setLanguage,
    clearLanguage,
    getLanguageById,
    hasLastLanguage,
    getLastLanguage,
    languageModes: LANGUAGE_MODES
  };
};

export default useLanguageManager;
