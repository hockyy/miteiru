import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { KeyboardHelp } from "../components/VideoPlayer/KeyboardHelp";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import { useToolsCheck } from "../hooks/useToolsCheck";
import { useLanguageLoader } from "../hooks/useLanguageLoader";
import { useCacheManager } from "../hooks/useCacheManager";
import 'react-awesome-button/dist/styles.css';
import { AwesomeButton } from "react-awesome-button";
import SmoothCollapse from "react-smooth-collapse";
import Toggle from "../components/VideoPlayer/Toggle";

const checkSymbol = ['❓', '✅', '🙃']

const HomeCard = ({title, subtitle, children, className = ''}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`rounded-2xl border-2 border-blue-200 bg-white/90 p-4 shadow-sm ${className}`}>
    <div className="mb-3">
      <h2 className="text-xl font-bold text-blue-950">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
    {children}
  </section>
);

const ButtonWrap = ({children, className = ''}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`min-w-fit overflow-visible p-1 ${className}`}>
    {children}
  </div>
);

const StatusLine = ({symbol, message, tone = 'slate'}: {
  symbol: string;
  message: string;
  tone?: 'blue' | 'green' | 'orange' | 'slate';
}) => {
  const toneClasses = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-800'
  };

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${toneClasses[tone]}`}>
      <span className="mr-2">{symbol}</span>
      {message}
    </div>
  );
};

const getLanguageMeta = (name: string) => {
  const [engine, language] = name.split(' - ');

  return {
    engine: engine || name,
    language: language || name,
  };
};

function Home() {
  const { miteiruVersion } = useMiteiruVersion();
  const { toolsCheck, isChecking: toolsCheckInProgress, isDownloading, checkMediaTools, downloadTool } = useToolsCheck();
  const { 
    check, 
    tokenizerMode, 
    setTokenizerMode,
    isAutoLoading,
    isLoadingLanguage,
    autoLoadEnabled,
    setAutoLoadEnabled,
    languageModes,
    ableToProceedToVideo,
    handleLanguageButtonClick,
    performAutoLoad
  } = useLanguageLoader();
  const { mecab, setMecab, isRemovingCache, handleSelectMecabPath, handleRemoveCache } = useCacheManager();

  // Cache state management
  const [cacheCheck, setCacheCheck] = useState({ ok: 0, message: '🐸 ゲロゲロ' });
  const [liveCaptionsSupported, setLiveCaptionsSupported] = useState(false);
  const [liveCaptionsChecked, setLiveCaptionsChecked] = useState(false);

  // Auto-load last language on startup and check media tools
  useEffect(() => {
    let mounted = true; // Prevent state updates if component unmounts
    
    const autoLoad = async () => {
      if (!mounted) return;
      
      // Check media tools availability on startup
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
      
      if (!mounted) return;
      
      // Perform language auto-loading
      await performAutoLoad();
    };

    autoLoad();
    
    return () => {
      mounted = false;
    };
  }, [checkMediaTools, performAutoLoad]);

  // Handle cache removal with state updates
  const handleRemoveCacheWithState = useCallback(async () => {
    setCacheCheck({
      ok: 2,
      message: 'Removing Caches '
    });
    
    const result = await handleRemoveCache();
    setCacheCheck(result);
  }, [handleRemoveCache]);

  const setAutoLoadEnabledHandler = useCallback((val: boolean) => {
    setAutoLoadEnabled(val);
  }, [setAutoLoadEnabled]);
  if (isAutoLoading) {
    return (
      <React.Fragment>
        <Head>
          <title>Miteiru v{miteiruVersion}</title>
        </Head>
        <div className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
          <div className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-full md:w-4/5 p-5 rounded-lg border-blue-800 border-2"}>
            <div className={'text-4xl text-black font-bold'}>Loading Miteiru...</div>
          </div>
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <Head>
        <title>Miteiru v{miteiruVersion}</title>
      </Head>
      <div
        className={"h-screen w-[100vw] overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-4 text-slate-900"}>
        <div className={"mx-auto flex h-full w-full max-w-6xl flex-col gap-4"}>
          <header className="rounded-3xl border-2 border-blue-200 bg-blue-100/80 p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-blue-700">Miteiru v{miteiruVersion}</div>
                <h1 className="mt-1 text-3xl font-black text-blue-950">What are we watching today?</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-700">
                  Pick your language tools, check the extras, then jump into video mode. Frogs are still supervising.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm text-blue-900">
                🐸 Ready check: {checkSymbol[check.ok]} {check.message}
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
            <HomeCard
              title="Language Setup"
              subtitle="Choose the language stack Miteiru should load before opening the player."
              className="min-h-0 overflow-y-auto"
            >
              <div className={'grid gap-3 sm:grid-cols-2'}>
                {languageModes.map(mode => {
                  const selected = tokenizerMode === mode.id;
                  const {engine, language} = getLanguageMeta(mode.name);

                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setTokenizerMode(mode.id)}
                      className={[
                        'group min-h-[110px] rounded-2xl border-2 p-3 text-left transition-all',
                        'hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 hover:shadow-md',
                        'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2',
                        selected
                          ? 'border-blue-500 bg-blue-100 shadow-md'
                          : 'border-blue-100 bg-white'
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-black uppercase tracking-wide text-blue-700">{engine}</div>
                          <div className="mt-1 text-xl font-black text-blue-950">{language}</div>
                        </div>
                        <div className="text-3xl">{mode.emoji}</div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 group-hover:bg-white">
                          {mode.channel.replace('load', '') || 'Ready'}
                        </div>
                        <div className={`h-4 w-4 rounded-full border-2 ${selected ? 'border-blue-700 bg-blue-500' : 'border-blue-200 bg-white'}`}/>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-600">{mode.description}</div>
                    </button>
                  );
                })}
              </div>

              <SmoothCollapse expanded={tokenizerMode === 1}>
                <div className={"mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4"}>
                  <div className={"flex flex-col gap-3 overflow-visible md:flex-row md:items-center"}>
                    <ButtonWrap>
                      <AwesomeButton onPress={handleSelectMecabPath}>
                        Select Mecab Path
                      </AwesomeButton>
                    </ButtonWrap>
                    <input
                      className={"w-full rounded-lg border border-gray-300 px-3 py-2 text-lg text-blue-800 outline-none ring-1 ring-blue-200 focus:border-blue-500 focus:ring-blue-500"}
                      type={"text"} value={mecab}
                      onChange={(val) => {
                        setMecab(val.target.value)
                      }}></input>
                  </div>
                </div>
              </SmoothCollapse>

              <div className="mt-4 flex flex-col gap-4 overflow-visible md:flex-row md:items-center md:justify-between">
                <ButtonWrap>
                  <AwesomeButton
                    type={'primary'}
                    onPress={handleLanguageButtonClick}
                    className={ableToProceedToVideo ? '' : 'buttonDisabled'}
                    disabled={!ableToProceedToVideo || isLoadingLanguage}>
                    {isLoadingLanguage ? (
                      <div className={'text-xl'}>Loading...</div>
                    ) : (
                      languageModes.find(m => m.id === tokenizerMode)?.description &&
                      <div className={'text-xl'}>{languageModes.find(m => m.id === tokenizerMode)?.description}</div>
                    )}
                  </AwesomeButton>
                </ButtonWrap>
                <div className={'flex flex-row gap-4 items-center'}>
                  <Toggle isChecked={autoLoadEnabled} onChange={setAutoLoadEnabledHandler} />
                  <label htmlFor="autoLoadCheckbox" className={'text-gray-700 cursor-pointer select-none'}>
                    🔄 Auto-load last language on startup
                  </label>
                </div>
              </div>
            </HomeCard>

            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <HomeCard
                title="Live Captions"
                subtitle="Windows-only real-time captions for videos without subtitle files."
              >
                {!liveCaptionsChecked ? (
                  <StatusLine symbol="🙃" message="Checking Windows Live Captions support..." tone="slate" />
                ) : liveCaptionsSupported ? (
                  <StatusLine symbol="✅" message="Available on this device. You can start it from the video screen." tone="green" />
                ) : (
                  <StatusLine symbol="🙃" message="Not available here. This feature is skipped outside Windows." tone="orange" />
                )}
                <p className="mt-3 text-sm text-slate-600">
                  Uses Windows Live Captions as the recognizer and keeps regular subtitle files untouched.
                </p>
              </HomeCard>

              <HomeCard
                title="Maintenance"
                subtitle="Small housekeeping buttons for local caches and optional tools."
              >
                <div className={'flex flex-wrap gap-3 overflow-visible'}>
                  <ButtonWrap>
                    <AwesomeButton
                      type={"danger"}
                      disabled={isRemovingCache}
                      onPress={handleRemoveCacheWithState}>
                      {isRemovingCache ? 'Removing...' : 'Remove Dict Caches'}
                    </AwesomeButton>
                  </ButtonWrap>
                  <ButtonWrap>
                    <AwesomeButton
                      type={"secondary"}
                      disabled={toolsCheckInProgress}
                      onPress={() => checkMediaTools(true)}>
                      {toolsCheckInProgress ? 'Checking...' : 'Check Optional Tools'}
                    </AwesomeButton>
                  </ButtonWrap>
                </div>
                <div className="mt-4">
                  <StatusLine symbol={checkSymbol[cacheCheck.ok]} message={cacheCheck.message} />
                </div>
              </HomeCard>

              <HomeCard
                title="Optional Media Tools"
                subtitle="FFmpeg extras for track selection and subtitle extraction."
                className="min-h-0"
              >
                <StatusLine symbol={checkSymbol[toolsCheck.ok]} message={toolsCheck.message} tone="blue" />

                {toolsCheck.details && (
                  <div className={'mt-3 grid max-h-44 gap-2 overflow-y-auto pr-1'}>
                    {Object.entries(toolsCheck.details).map(([toolName, status]: [string, any]) => (
                      <div key={toolName} className={'flex flex-wrap items-center justify-between gap-3 overflow-visible rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm'}>
                        <span className={'text-gray-700'}>
                          {status.available ? '✅' : '❌'} {toolName}
                          {status.isInternal && ' (internal)'}
                        </span>
                        {!status.available && (
                          <ButtonWrap className="py-0">
                            <AwesomeButton
                              type="link"
                              size="small"
                              disabled={isDownloading === toolName}
                              onPress={() => downloadTool(toolName)}
                            >
                              {isDownloading === toolName ? 'Opening...' : 'Open Link'}
                            </AwesomeButton>
                          </ButtonWrap>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {toolsCheck.missingTools && toolsCheck.missingTools.length > 0 && (
                  <div className={'mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3'}>
                    <div className={'text-sm font-medium text-blue-800'}>
                      💡 Optional Tools Available: {toolsCheck.missingTools.join(', ')}
                    </div>
                    <div className={'mt-1 text-xs text-blue-600'}>
                      Click Open Link to download if desired.
                    </div>
                  </div>
                )}

                {toolsCheck.cached && !toolsCheckInProgress && (
                  <div className={'mt-2 text-sm text-gray-500'}>📋 Cached result (click button to refresh)</div>
                )}
              </HomeCard>
            </div>
          </div>
        </div>
        <KeyboardHelp />
      </div>
    </React.Fragment>
  );
}

export default Home;
