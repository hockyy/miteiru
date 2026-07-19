import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { KeyboardHelp } from "../components/VideoPlayer/KeyboardHelp";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import { useToolsCheck } from "../hooks/useToolsCheck";
import { useLanguageLoader } from "../hooks/useLanguageLoader";
import { useCacheManager } from "../hooks/useCacheManager";
import { MainMenu } from "../components/Home/MainMenu";
import { HomeSystemPanel } from "../components/Home/HomeSystemPanel";
import { HOME_PAGE_BG } from "../components/Home/homeMenuTheme";
import { getMiteiruAppName } from "../utils/utils";

const DICT_CACHE_CONFIRM_STEPS = [
  'Remove all dictionary caches?\n\nThis deletes locally stored dictionary data.',
  'Languages will need to re-download dictionaries on next use. Continue?',
  'Final confirmation — this cannot be undone. Remove dict caches now?',
] as const;

const confirmDictCacheRemoval = () => (
  DICT_CACHE_CONFIRM_STEPS.every((message) => window.confirm(message))
);

const getLanguageMeta = (name: string) => {
  const [engine, language] = name.split(' - ');

  return {
    engine: engine || name,
    language: language || name,
  };
};

const formatLanguageOption = (mode: { id: number; name: string; emoji: string }, isLastUsed: boolean) => {
  const {engine, language} = getLanguageMeta(mode.name);
  const lastSuffix = isLastUsed ? ' · last used' : '';
  return `${mode.emoji} ${engine} — ${language}${lastSuffix}`;
};

function Home() {
  const { miteiruVersion } = useMiteiruVersion();
  const { toolsCheck, isChecking: toolsCheckInProgress, isDownloading, checkMediaTools, downloadTool } = useToolsCheck();
  const {
    check,
    tokenizerMode,
    setTokenizerMode,
    lastLanguageMode,
    isLoadingLanguage,
    languageModes,
    ableToProceedToVideo,
    handleLanguageButtonClick,
    handleOpenLearn,
    handleOpenFlash,
  } = useLanguageLoader();
  const { mecab, setMecab, isRemovingCache, handleSelectMecabPath, handleRemoveCache } = useCacheManager();

  const [cacheCheck, setCacheCheck] = useState({ ok: 0, message: '🐸 ゲロゲロ' });
  const [liveCaptionsSupported, setLiveCaptionsSupported] = useState(false);
  const [liveCaptionsChecked, setLiveCaptionsChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeHome = async () => {
      if (!mounted) return;

      await checkMediaTools();

      window.electronAPI.liveCaptions.isSupported()
        .then((supported) => {
          if (!mounted) return;
          setLiveCaptionsSupported(supported);
        })
        .catch(() => {
          if (!mounted) return;
          setLiveCaptionsSupported(false);
        })
        .finally(() => {
          if (!mounted) return;
          setLiveCaptionsChecked(true);
        });
    };

    initializeHome();

    return () => {
      mounted = false;
    };
  }, [checkMediaTools]);

  const handleRemoveCacheWithState = useCallback(async () => {
    if (!confirmDictCacheRemoval()) {
      return;
    }

    setCacheCheck({
      ok: 2,
      message: 'Removing caches...'
    });

    const result = await handleRemoveCache();
    setCacheCheck(result);
  }, [handleRemoveCache]);

  const liveCaptionsMessage = !liveCaptionsChecked
    ? 'Checking Live CC…'
    : liveCaptionsSupported
      ? 'Live CC available'
      : 'Live CC unavailable';

  const liveCaptionsTone = !liveCaptionsChecked
    ? 'slate'
    : liveCaptionsSupported
      ? 'green'
      : 'orange';

  const liveCaptionsSymbol = !liveCaptionsChecked
    ? '🙃'
    : liveCaptionsSupported
      ? '✅'
      : '🙃';

  const selectedLanguageMode = languageModes.find((mode) => mode.id === tokenizerMode);
  const showCacheStatus = cacheCheck.ok !== 0 || cacheCheck.message !== '🐸 ゲロゲロ';

  return (
    <React.Fragment>
      <Head>
        <title>{getMiteiruAppName()} v{miteiruVersion}</title>
      </Head>
      <div className={HOME_PAGE_BG}>
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4">
          <MainMenu
            miteiruVersion={miteiruVersion}
            checkOk={check.ok}
            checkMessage={check.message}
            languageModes={languageModes}
            tokenizerMode={tokenizerMode}
            lastLanguageMode={lastLanguageMode}
            selectedLanguageMode={selectedLanguageMode}
            isLoadingLanguage={isLoadingLanguage}
            ableToProceedToVideo={ableToProceedToVideo}
            mecab={mecab}
            onLanguageChange={setTokenizerMode}
            onMecabChange={setMecab}
            onSelectMecabPath={handleSelectMecabPath}
            onOpenVideo={handleLanguageButtonClick}
            onOpenLearn={handleOpenLearn}
            onOpenFlash={handleOpenFlash}
            formatLanguageOption={formatLanguageOption}
          />

          <HomeSystemPanel
            liveCaptionsSymbol={liveCaptionsSymbol}
            liveCaptionsMessage={liveCaptionsMessage}
            liveCaptionsTone={liveCaptionsTone}
            toolsCheckOk={toolsCheck.ok}
            toolsCheckMessage={toolsCheck.message}
            toolsCheckInProgress={toolsCheckInProgress}
            toolsCheckDetails={toolsCheck.details}
            toolsCheckMissingTools={toolsCheck.missingTools}
            toolsCheckCached={toolsCheck.cached}
            isDownloading={isDownloading}
            onRefreshTools={() => checkMediaTools(true)}
            onDownloadTool={downloadTool}
            isRemovingCache={isRemovingCache}
            cacheCheckOk={cacheCheck.ok}
            cacheCheckMessage={cacheCheck.message}
            showCacheStatus={showCacheStatus}
            onRemoveDictCaches={handleRemoveCacheWithState}
          />
        </div>
        <KeyboardHelp />
      </div>
    </React.Fragment>
  );
}

export default Home;
