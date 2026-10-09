import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useLanguageManager from './useLanguageManager';

interface LanguageCheckResult {
  ok: number;
  message: string;
}

const initialCheck: LanguageCheckResult = { 
  ok: 0, 
  message: '🐸 ゲロゲロ' 
};

const checkingMessage: LanguageCheckResult = {
  ok: 2,
  message: "checking..."
};

export const useLanguageLoader = () => {
  const router = useRouter();
  const [check, setCheck] = useState<LanguageCheckResult>(initialCheck);
  const [tokenizerMode, setTokenizerMode] = useState(0);
  const [isLoadingLanguage, setIsLoadingLanguage] = useState(false);

  const {
    lastLanguageMode,
    setLanguage,
    clearLanguage,
    migratedFromRemovedMode,
    languageModes
  } = useLanguageManager();

  useEffect(() => {
    if (migratedFromRemovedMode) {
      setCheck({ok: 0, message: 'MeCab was removed; Kuromoji uses the same dictionary and needs no setup.'});
    }
  }, [migratedFromRemovedMode]);

  useEffect(() => {
    if (lastLanguageMode === null || lastLanguageMode === undefined) {
      return;
    }
    if (languageModes.some((mode) => mode.id === lastLanguageMode)) {
      setTokenizerMode(lastLanguageMode);
    }
  }, [lastLanguageMode, languageModes]);

  const selectTokenizerMode = useCallback((modeId: number) => {
    setTokenizerMode(modeId);
    setLanguage(modeId);
  }, [setLanguage]);

  const loadLanguage = useCallback(async (
    modeId: number,
    destination: '/video' | '/learn' | '/flash' = '/video',
  ) => {
    if (isLoadingLanguage) {
      console.log('[Language Load] Language loading already in progress, ignoring request');
      return;
    }

    const mode = languageModes.find(m => m.id === modeId);
    if (!mode) return;

    setIsLoadingLanguage(true);
    setCheck(checkingMessage);
    
    try {
      const res = await window.ipc.invoke(mode.channel);
      setCheck(res);

      if (res.ok === 1) {
        setLanguage(modeId);
        await router.push(destination);
      }
    } catch (error) {
      setCheck({
        ok: 0,
        message: `Error loading language: ${error.message}`
      });
    } finally {
      setIsLoadingLanguage(false);
    }
  }, [languageModes, setLanguage, router, isLoadingLanguage]);

  const handleLanguageButtonClick = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/video');
  }, [loadLanguage, tokenizerMode]);

  const handleOpenLearn = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/learn');
  }, [loadLanguage, tokenizerMode]);

  const handleOpenFlash = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/flash');
  }, [loadLanguage, tokenizerMode]);

  const ableToProceedToVideo = check.ok !== 2 && !isLoadingLanguage;

  return {
    // State
    check,
    tokenizerMode,
    setTokenizerMode: selectTokenizerMode,
    lastLanguageMode,
    isLoadingLanguage,
    languageModes,
    ableToProceedToVideo,

    // Actions
    loadLanguage,
    handleLanguageButtonClick,
    handleOpenLearn,
    handleOpenFlash,
    clearLanguage
  };
};
