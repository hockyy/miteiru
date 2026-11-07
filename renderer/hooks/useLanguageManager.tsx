import { useCallback, useEffect, useState } from 'react';
import { useStoreData } from './useStoreData';
import {languageModes} from "../languages/manifest";

export interface LanguageMode {
  id: number;
  name: string;
  channel: string;
  emoji: string;
  description: string;
  /** What the home page shows: the flag, the language's own name and its English name. */
  flag: string;
  nativeName: string;
  englishName: string;
  languageCode: string;
}

export const LANGUAGE_MODES: LanguageMode[] = languageModes.map(({
  id,
  name,
  channel,
  emoji,
  description,
  flag,
  nativeName,
  englishName,
  languageCode
}) => ({
  id,
  name,
  channel,
  emoji,
  description,
  flag,
  nativeName,
  englishName,
  languageCode
}));

// MeCab (mode 1) was removed: Kuromoji uses the same IPADIC dictionary without an external install.
const REMOVED_MODE_REPLACEMENTS: Record<number, number> = {1: 0};

const useLanguageManager = () => {
  const [storedLanguageMode, setLastLanguageMode, languageLoaded] = useStoreData('app.lastLanguageMode', null);
  const lastLanguageMode = REMOVED_MODE_REPLACEMENTS[storedLanguageMode] ?? storedLanguageMode;
  // Set once when a removed mode is migrated, so the home screen can say why the selection changed.
  const [migratedFromRemovedMode, setMigratedFromRemovedMode] = useState(false);

  useEffect(() => {
    if (!(storedLanguageMode in REMOVED_MODE_REPLACEMENTS)) return;
    setMigratedFromRemovedMode(true);
    setLastLanguageMode(REMOVED_MODE_REPLACEMENTS[storedLanguageMode]);
  }, [storedLanguageMode, setLastLanguageMode]);

  const setLanguage = useCallback((modeId: number | null) => {
    setLastLanguageMode(modeId);
  }, [setLastLanguageMode]);

  const getLanguageById = useCallback((id: number): LanguageMode | undefined => {
    return LANGUAGE_MODES.find(mode => mode.id === id);
  }, []);

  return {
    lastLanguageMode,
    // False until the remembered language has been read from the store.
    languageLoaded,
    setLanguage,
    getLanguageById,
    migratedFromRemovedMode,
    languageModes: LANGUAGE_MODES
  };
};

export default useLanguageManager;
