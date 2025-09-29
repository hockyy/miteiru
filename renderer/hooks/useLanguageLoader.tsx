import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useLanguageManager from './useLanguageManager';
import { useStoreData } from './useStoreData';

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
  const [isAutoLoading, setIsAutoLoading] = useState(true);
  const [isLoadingLanguage, setIsLoadingLanguage] = useState(false);

  const {
    hasLastLanguage,
    getLastLanguage,
    setLanguage,
    clearLanguage,
    languageModes
  } = useLanguageManager();

  const [autoLoadEnabled, setAutoLoadEnabled] = useStoreData('app.autoLoadLastLanguage', true);

  const loadLanguage = useCallback(async (modeId: number) => {
    // Prevent multiple concurrent language loads
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
        setLanguage(modeId); // Save the successful language selection
        await router.push('/video');
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

  // Auto-load last language on startup
  const performAutoLoad = useCallback(async () => {
    if (autoLoadEnabled && hasLastLanguage()) {
      const lastLanguage = getLastLanguage();
      if (lastLanguage) {
        setTokenizerMode(lastLanguage.id);
        await loadLanguage(lastLanguage.id);
      }
    }
    setIsAutoLoading(false);
  }, []); // Remove dependencies to prevent infinite loops - values are captured correctly

  const handleLanguageButtonClick = useCallback(async () => {
    await loadLanguage(tokenizerMode);
  }, [loadLanguage, tokenizerMode]);

  const ableToProceedToVideo = check.ok !== 2 && !isLoadingLanguage;

  return {
    // State
    check,
    tokenizerMode,
    setTokenizerMode,
    isAutoLoading,
    isLoadingLanguage,
    autoLoadEnabled,
    setAutoLoadEnabled,
    languageModes,
    ableToProceedToVideo,

    // Actions
    loadLanguage,
    handleLanguageButtonClick,
    performAutoLoad,
    clearLanguage
  };
};
