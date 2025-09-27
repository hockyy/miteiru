import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import { ContainerHome } from "../components/VideoPlayer/ContainerHome";
import { KeyboardHelp } from "../components/VideoPlayer/KeyboardHelp";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import 'react-awesome-button/dist/styles.css';
import { AwesomeButton } from "react-awesome-button";
import { useRouter } from "next/router";
import SmoothCollapse from "react-smooth-collapse";
import useLanguageManager from "../hooks/useLanguageManager";
import { useStoreData } from "../hooks/useStoreData";
import Toggle from "../components/VideoPlayer/Toggle";

const checkSymbol = ['❓', '✅', '🙃']
const initialCheck = { ok: 0, message: '🐸 ゲロゲロ' }
const mecabDefaultDirectory = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': 'C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe'
}
const checkingMessage = {
  ok: 2,
  message: "checking..."
}

function Home() {
  const router = useRouter();
  const [mecab, setMecab] = useState(mecabDefaultDirectory[process.platform] ?? mecabDefaultDirectory['linux']);
  const [check, setCheck] = useState(initialCheck);
  const [tokenizerMode, setTokenizerMode] = useState(0);
  const [isAutoLoading, setIsAutoLoading] = useState(true);
  const [showManualSelection, setShowManualSelection] = useState(false);

  const {
    hasLastLanguage,
    getLastLanguage,
    setLanguage,
    clearLanguage,
    languageModes
  } = useLanguageManager();

  const [autoLoadEnabled, setAutoLoadEnabled] = useStoreData('app.autoLoadLastLanguage', true);

  const loadLanguage = useCallback(async (modeId: number) => {
    const mode = languageModes.find(m => m.id === modeId);
    if (!mode) return;

    setCheck(checkingMessage);
    const res = await window.ipc.invoke(mode.channel);
    setCheck(res);

    if (res.ok === 1) {
      setLanguage(modeId); // Save the successful language selection
      await router.push('/video');
    }
  }, [languageModes, setLanguage, router]);

  // Auto-load last language on startup
  useEffect(() => {
    const autoLoad = async () => {
      if (autoLoadEnabled && hasLastLanguage()) {
        const lastLanguage = getLastLanguage();
        if (lastLanguage) {
          setTokenizerMode(lastLanguage.id);
          await loadLanguage(lastLanguage.id);
        }
      }
      setIsAutoLoading(false);
    };

    autoLoad();
  }, [autoLoadEnabled, hasLastLanguage, getLastLanguage, loadLanguage]);

  const handleClick = useCallback(async () => {
    await loadLanguage(tokenizerMode);
  }, [loadLanguage, tokenizerMode]);

  const handleSelectMecabPath = useCallback(() => {
    window.ipc.invoke('pickFile', ['*']).then((val) => {
      if (!val.canceled) setMecab(val.filePaths[0]);
    });
  }, []);
  const handleRemoveCache = useCallback(() => {
    setCheck({
      ok: 2,
      message: 'Removing Caches '
    });
    window.ipc.invoke('removeDictCache').then((result) => {
      setCheck({
        ok: 0,
        message: result
      });
    });
  }, []);
  const { miteiruVersion } = useMiteiruVersion();
  const ableToProceedToVideo = (check.ok !== 2);
  const setAutoLoadEnabledHandler = useCallback((val) => {
    setAutoLoadEnabled(val)
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
            <AwesomeButton
              type={"danger"}
              onPress={handleRemoveCache}>
              Remove Dict Caches
            </AwesomeButton>
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
            <div className={'text-black'}>
              {checkSymbol[check.ok]}{' '}{check.message}
            </div>
            <AwesomeButton type={'primary'} onPress={handleClick}
              className={ableToProceedToVideo ? '' : 'buttonDisabled'}
              disabled={!ableToProceedToVideo}>
              {languageModes.find(m => m.id === tokenizerMode)?.description &&
                <div className={'text-xl'}>{languageModes.find(m => m.id === tokenizerMode)?.description}</div>
              }
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
