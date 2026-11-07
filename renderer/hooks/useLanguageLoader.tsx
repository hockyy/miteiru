import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useLanguageManager from './useLanguageManager';
import { languageModes as manifestLanguageModes } from '../languages/manifest';
import { setLearningLanguage } from '../utils/fonts';
import { languageSetupFailure } from '../utils/languageErrors';

interface LanguageCheckResult {
  ok: number;
  message: string;
  /** The raw reason behind a friendly message, for the "Details" under it. */
  details?: string | null;
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
    languageLoaded,
    setLanguage,
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

  // Home's Japanese and Chinese text uses the fonts of the selected language, as the other pages do.
  useEffect(() => {
    setLearningLanguage(manifestLanguageModes.find((mode) => mode.id === tokenizerMode)?.languageCode ?? '');
  }, [tokenizerMode]);

  const selectTokenizerMode = useCallback((modeId: number) => {
    setTokenizerMode(modeId);
    setLanguage(modeId);
  }, [setLanguage]);

  const loadLanguage = useCallback(async (
    modeId: number,
    destination: '/video' | '/video?continue=1' | '/learn' | '/flash' = '/video',
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
      const res = await window.backend.invoke(mode.channel);

      if (res.ok === 1) {
        setCheck(res);
        setLanguage(modeId);
        await router.push(destination);
      } else {
        setCheck({ok: 0, ...languageSetupFailure(mode.englishName, res?.message)});
      }
    } catch (error) {
      setCheck({ok: 0, ...languageSetupFailure(mode.englishName, error?.message)});
    } finally {
      setIsLoadingLanguage(false);
    }
  }, [languageModes, setLanguage, router, isLoadingLanguage]);

  const handleLanguageButtonClick = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/video');
  }, [loadLanguage, tokenizerMode]);

  // Opens the Watch page, which opens the last video where it stopped.
  const handleContinueVideo = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/video?continue=1');
  }, [loadLanguage, tokenizerMode]);

  const handleOpenLearn = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/learn');
  }, [loadLanguage, tokenizerMode]);

  const handleOpenFlash = useCallback(async () => {
    await loadLanguage(tokenizerMode, '/flash');
  }, [loadLanguage, tokenizerMode]);

  // Until the remembered language is read, the selection still shows the first mode (Kuromoji).
  const ableToProceedToVideo = check.ok !== 2 && !isLoadingLanguage && languageLoaded;
  // What the user should read: a failed load or a notice, not the idle placeholder or "checking...".
  const notice = check.ok === 0 && check !== initialCheck ? check.message : null;
  const noticeDetails = notice ? check.details ?? null : null;

  return {
    // State
    notice,
    noticeDetails,
    tokenizerMode,
    setTokenizerMode: selectTokenizerMode,
    isLoadingLanguage,
    languageModes,
    ableToProceedToVideo,

    // Actions
    loadLanguage,
    handleLanguageButtonClick,
    handleContinueVideo,
    handleOpenLearn,
    handleOpenFlash
  };
};
