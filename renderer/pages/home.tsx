import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { ContainerHome } from "../components/VideoPlayer/ContainerHome";
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

  // Auto-load last language on startup and check media tools
  useEffect(() => {
    let mounted = true; // Prevent state updates if component unmounts
    
    const autoLoad = async () => {
      if (!mounted) return;
      
      // Check media tools availability on startup
      await checkMediaTools();
      
      if (!mounted) return;
      
      // Perform language auto-loading
      await performAutoLoad();
    };

    autoLoad();
    
    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array - only run once on mount

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
          <div className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-full md:w-4/5 p-5 border rounded-lg border-blue-800 border-2"}>
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
        className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
        <div
          className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-full md:w-4/5 p-5 border rounded-lg border-blue-800 border-2"}>
          <>
            <div className={'flex flex-row gap-4'}>
              <AwesomeButton
                type={"danger"}
                disabled={isRemovingCache}
                onPress={handleRemoveCacheWithState}>
                {isRemovingCache ? 'Removing...' : 'Remove Dict Caches'}
              </AwesomeButton>
              <AwesomeButton
                type={"secondary"}
                disabled={toolsCheckInProgress}
                onPress={() => checkMediaTools(true)}>
                {toolsCheckInProgress ? 'Checking...' : 'Check Optional Tools'}
              </AwesomeButton>
            </div>
            <div className={'flex flex-row gap-4 text-4xl text-black font-bold'}>
              <div onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setTokenizerMode(parseInt(e.target.value, 10))
              }} className={'flex flex-col'}>
                {languageModes.map(mode => (
                  <div key={mode.id} className="custom-radio">
                    <input type="radio" id={`mode${mode.id}`} value={mode.id} name="tokenizerMode"
                      checked={tokenizerMode === mode.id} readOnly />
                    <label htmlFor={`mode${mode.id}`}>{mode.name} {mode.emoji}</label>
                  </div>
                ))}
              </div>
            </div>
            <SmoothCollapse expanded={tokenizerMode === 1}><ContainerHome>
              <div className={"flex justify-between  gap-3 p-3 w-full"}>
                <AwesomeButton
                  onPress={handleSelectMecabPath}>
                  Select Mecab Path
                </AwesomeButton>
                <input
                  className={"text-blue-800 outline-none rounded-sm text-lg md:min-w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}
                  type={"text"} value={mecab}
                  onChange={(val) => {
                    setMecab(val.target.value)
                  }}></input>
              </div>
            </ContainerHome></SmoothCollapse>
            <div className={'text-black border-t pt-2'}>
              <div className={'text-lg font-semibold mb-2'}>🎬 Optional Media Tools:</div>
              <div className={'text-sm text-gray-600 mb-2'}>These tools enhance video processing but are not required</div>
              <div>{checkSymbol[toolsCheck.ok]}{' '}{toolsCheck.message}</div>
              
              {/* Tool details */}
              {toolsCheck.details && (
                <div className={'mt-2 space-y-1'}>
                  {Object.entries(toolsCheck.details).map(([toolName, status]: [string, any]) => (
                    <div key={toolName} className={'flex items-center justify-between text-sm'}>
                      <span className={'text-gray-600'}>
                        {status.available ? '✅' : '❌'} {toolName}
                        {status.isInternal && ' (internal)'}
                      </span>
                      {!status.available && (
                        <AwesomeButton
                          type="link"
                          size="small"
                          disabled={isDownloading === toolName}
                          onPress={() => downloadTool(toolName)}
                        >
                          {isDownloading === toolName ? 'Opening...' : 'Open Link'}
                        </AwesomeButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Missing tools info section */}
              {toolsCheck.missingTools && toolsCheck.missingTools.length > 0 && (
                <div className={'mt-2 p-2 bg-blue-50 border border-blue-200 rounded'}>
                  <div className={'text-sm text-blue-800 font-medium'}>
                    💡 Optional Tools Available: {toolsCheck.missingTools.join(', ')}
                  </div>
                  <div className={'text-xs text-blue-600 mt-1'}>
                    These tools can enhance your experience - click Open Link to download if desired
                  </div>
                </div>
              )}
              
              {toolsCheck.cached && !toolsCheckInProgress && (
                <div className={'text-sm text-gray-500 mt-1'}>📋 Cached result (click button to refresh)</div>
              )}
            </div>
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
            <div className={'flex flex-row gap-4 items-center'}>
              <Toggle isChecked={autoLoadEnabled} onChange={setAutoLoadEnabledHandler} />
              <label htmlFor="autoLoadCheckbox" className={'text-gray-700 cursor-pointer select-none'}>
                🔄 Auto-load last language on startup
              </label>
            </div>
          </>
        </div>
        <KeyboardHelp />
      </div>
    </React.Fragment>
  );
}

export default Home;
