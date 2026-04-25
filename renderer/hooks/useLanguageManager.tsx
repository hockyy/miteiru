import { useCallback } from 'react';
import { useStoreData } from './useStoreData';

export interface LanguageMode {
  id: number;
  name: string;
  channel: string;
  emoji: string;
  description: string;
}

export const LANGUAGE_MODES: LanguageMode[] = [
  {
    id: 0,
    name: 'Kuromoji - Japanese',
    channel: 'loadKuromoji',
    emoji: '🐣',
    description: 'うん、ちょっと見てるだけ 😏'
  },
  {
    id: 1,
    name: 'Mecab - Japanese',
    channel: 'loadMecab',
    emoji: '👹',
    description: '準備OK、船長！🫡'
  },
  {
    id: 2,
    name: 'Jieba - Cantonese',
    channel: 'loadCantonese',
    emoji: '🥘',
    description: '準備好啦，行啊'
  },
  {
    id: 3,
    name: 'Jieba - Chinese',
    channel: 'loadChinese',
    emoji: '🐉',
    description: '加油! 💥'
  },
  {
    id: 4,
    name: 'Vietnamese',
    channel: 'loadVietnamese',
    emoji: '🏯',
    description: 'Chúc may mắn! 🌟'
  }
];

const useLanguageManager = () => {
  const [lastLanguageMode, setLastLanguageMode] = useStoreData('app.lastLanguageMode', null);

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
