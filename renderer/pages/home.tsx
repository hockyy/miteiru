import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { KeyboardHelp } from "../components/VideoPlayer/KeyboardHelp";
import useLastVideo from "../hooks/useLastVideo";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import { useToolsCheck } from "../hooks/useToolsCheck";
import { useLanguageLoader } from "../hooks/useLanguageLoader";
import { useLanguagePacks } from "../hooks/useLanguagePacks";
import { useCacheManager } from "../hooks/useCacheManager";
import { MainMenu } from "../components/Home/MainMenu";
import { HomeSystemPanel } from "../components/Home/HomeSystemPanel";
import { HOME_PAGE_BG } from "../components/Home/homeMenuTheme";
import { getMiteiruAppName } from "../utils/utils";

// One honest question: nothing here touches the learner's own data.
const confirmOldDictionaryClear = () => (
  window.confirm('Removes dictionary files left by older versions. Your saved words and notes stay.')
);

function Home() {
  const { miteiruVersion } = useMiteiruVersion();
  const { toolsCheck, isChecking: toolsCheckInProgress, isDownloading, checkMediaTools, downloadTool } = useToolsCheck();
  const packs = useLanguagePacks();
  const {
    notice,
    noticeDetails,
    tokenizerMode,
    setTokenizerMode,
    isLoadingLanguage,
    languageModes,
    ableToProceedToVideo,
    handleLanguageButtonClick,
    handleContinueVideo,
    handleOpenLearn,
    handleOpenFlash,
  } = useLanguageLoader(packs.packsEnabled ? packs.status : null);
  const { isRemovingCache, handleRemoveCache } = useCacheManager();
  const { last: lastVideo } = useLastVideo();

  const [cacheCheck, setCacheCheck] = useState({ ok: 0, message: '🐸 ゲロゲロ' });
  const [liveCaptionsSupported, setLiveCaptionsSupported] = useState(false);

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
        });
    };

    initializeHome();

    return () => {
      mounted = false;
    };
  }, [checkMediaTools]);

  const handleRemoveCacheWithState = useCallback(async () => {
    if (!confirmOldDictionaryClear()) {
      return;
    }

    setCacheCheck({
      ok: 2,
      message: 'Clearing old dictionary data…'
    });

    const result = await handleRemoveCache();
    // The handler's own wording is technical; say it plainly.
    setCacheCheck(result.ok === 1 ? { ok: 1, message: 'Old dictionary data cleared.' } : result);
  }, [handleRemoveCache]);

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
            languageNoticeDetails={noticeDetails}
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
            packs={packs}
          />

          <HomeSystemPanel
            liveCaptionsSupported={liveCaptionsSupported}
            toolsCheckOk={toolsCheck.ok}
            toolsCheckMessage={toolsCheck.message}
            toolsCheckInProgress={toolsCheckInProgress}
            toolsCheckDetails={toolsCheck.details}
            isDownloading={isDownloading}
            onRefreshTools={() => checkMediaTools(true)}
            onOpenToolsFolder={() => { window.electronAPI.openToolsFolder?.(); }}
            onDownloadTool={downloadTool}
            isRemovingCache={isRemovingCache}
            cacheCheckOk={cacheCheck.ok}
            cacheCheckMessage={cacheCheck.message}
            showCacheStatus={showCacheStatus}
            onRemoveDictCaches={handleRemoveCacheWithState}
            packs={packs}
          />
        </div>
        <KeyboardHelp languageName={languageModes.find((mode) => mode.id === tokenizerMode)?.englishName} />
      </div>
    </React.Fragment>
  );
}

export default Home;
