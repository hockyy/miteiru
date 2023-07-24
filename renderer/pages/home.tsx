import React, {useCallback, useState} from 'react';
import Head from 'next/head';
import {ipcRenderer} from 'electron';
import {ContainerHome} from "../components/ContainerHome";
import {KeyboardHelp} from "../components/KeyboardHelp";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import 'react-awesome-button/dist/styles.css';
import {AwesomeButton} from "react-awesome-button";
import {useRouter} from "next/router";
import Toggle from "../components/Toggle";
import SmoothCollapse from "react-smooth-collapse";

const checkSymbol = ['❓', '✅', '🙃']
const initialCheck = {ok: 0, message: '🐸 ゲロゲロ'}
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
  const [jmdict, setJmdict] = useState('');
  const [check, setCheck] = useState(initialCheck);
  const [isUsingMecab, setUsingMecab] = useState(false);
  const handleClick = useCallback(async () => {
    if (!isUsingMecab) {
      setCheck(checkingMessage);
      const res = await ipcRenderer.invoke('loadDefaultMode');
      setCheck(res);
      if (res.ok !== 1) {
        return;
      }
    }
    await router.push('/video');
  }, [check, router]);

  const handleSelectMecabPath = useCallback(() => {
    ipcRenderer.invoke('pickFile', ['*']).then((val) => {
      if (!val.canceled) setMecab(val.filePaths[0]);
    });
  }, []);

  const handleSelectJMDictJson = useCallback(() => {
    ipcRenderer.invoke('pickFile', ['json']).then((val) => {
      if (!val.canceled) setJmdict(val.filePaths[0]);
    });
  }, []);

  const handleCheck = useCallback((cached = false) => {
    setCheck(checkingMessage);
    ipcRenderer.invoke('validateConfig', {
      mecab, jmdict, cached
    }).then(val => {
      setCheck(val);
    });
  }, [mecab, jmdict]);

  const handleRemoveJMDictCache = useCallback(() => {
    setCheck({
      ok: 2,
      message: 'Removing JMDict Cache'
    });
    ipcRenderer.invoke('removeDictCache').then(() => {
      setCheck(initialCheck);
    });
  }, []);
  const {miteiruVersion} = useMiteiruVersion();
  const ableToProceedToVideo = (!isUsingMecab && check.ok !== 2) || (isUsingMecab && check.ok === 1)
  return (
      <React.Fragment>
        <Head>
          <title>Miteiru v{miteiruVersion}</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
          <div
              className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-full md:w-4/5 p-5 border rounded-lg border-blue-800 border-2"}>
            <div className={'flex flex-row gap-4 text-4xl text-black font-bold'}>
              <Toggle defaultCheck={isUsingMecab} onChange={(val) => {
                setUsingMecab(val);
              }}/>
              {isUsingMecab && <div>鬼畜 👹</div>}
              {!isUsingMecab && <div>ヌル 🐣</div>}
            </div>
            <SmoothCollapse expanded={isUsingMecab}><ContainerHome>
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
              <div className={"flex justify-between gap-3 p-3 w-full"}>
                <AwesomeButton
                    onPress={handleSelectJMDictJson}>
                  Select JMDict Json
                </AwesomeButton>
                <input
                    className={"text-blue-800 outline-none rounded-sm text-lg md:min-w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}
                    type={"text"} value={jmdict}
                    onChange={(val) => {
                      setJmdict(val.target.value)
                    }}></input>
              </div>
              <div className={'flex flex-col items-center gap-4'}>
                <div className={'flex flex-row gap-3'}>
                  <AwesomeButton
                      type={'secondary'}
                      disabled={check.ok === 2}
                      onPress={() => handleCheck(false)}>
                    Check
                  </AwesomeButton>
                  <AwesomeButton
                      type={'secondary'}
                      disabled={check.ok === 2}
                      onPress={() => handleCheck(true)}>
                    Check With Cache
                  </AwesomeButton>
                </div>
                <AwesomeButton
                    type={"danger"}
                    onPress={handleRemoveJMDictCache}>
                  Remove JMDict Cache
                </AwesomeButton>
              </div>
            </ContainerHome></SmoothCollapse>
            <div className={'text-black'}>
              {checkSymbol[check.ok]}{' '}{check.message}
            </div>
            <AwesomeButton type={'primary'} onPress={handleClick}
                           className={ableToProceedToVideo ? '' : 'buttonDisabled'}
                           disabled={!ableToProceedToVideo}>
              {!isUsingMecab && <div className={'text-xl'}>うん、ちょっと<span
                  className={'font-bold text-yellow-200'}>見てる</span>だけ 😏</div>}
              {isUsingMecab && <div className={'text-xl'}>準備OK、船長！🫡</div>}
            </AwesomeButton>
          </div>
          <KeyboardHelp/>
        </div>
      </React.Fragment>
  );
}

export default Home;
