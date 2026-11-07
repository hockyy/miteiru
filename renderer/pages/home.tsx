import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { KeyboardHelp } from "../components/VideoPlayer/KeyboardHelp";
import useLastVideo from "../hooks/useLastVideo";
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

function Home() {
  const { miteiruVersion } = useMiteiruVersion();
  const { toolsCheck, isChecking: toolsCheckInProgress, isDownloading, checkMediaTools, downloadTool } = useToolsCheck();
  const {
    notice,
    tokenizerMode,
    setTokenizerMode,
    isLoadingLanguage,
    languageModes,
    ableToProceedToVideo,
    handleLanguageButtonClick,
    handleContinueVideo,
    handleOpenLearn,
    handleOpenFlash,
  } = useLanguageLoader();
  const { isRemovingCache, handleRemoveCache } = useCacheManager();
  const { last: lastVideo } = useLastVideo();

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
            languageNotice={notice}
            languageModes={languageModes}
            tokenizerMode={tokenizerMode}
            isLoadingLanguage={isLoadingLanguage}
            ableToProceedToVideo={ableToProceedToVideo}
            onLanguageChange={setTokenizerMode}
            onOpenVideo={handleLanguageButtonClick}
            onOpenLearn={handleOpenLearn}
            onOpenFlash={handleOpenFlash}
            lastVideo={lastVideo}
            onContinue={handleContinueVideo}
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
        <KeyboardHelp languageName={languageModes.find((mode) => mode.id === tokenizerMode)?.englishName} />
      </div>
    </React.Fragment>
  );
}

export default Home;
