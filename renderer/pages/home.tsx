import React, {useCallback, useEffect, useState} from 'react';
import Head from 'next/head';
import {ipcRenderer} from 'electron';
import {ContainerHome} from "../components/ContainerHome";
import {KeyboardHelp} from "../components/KeyboardHelp";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import 'react-awesome-button/dist/styles.css';
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import {AwesomeButton} from "react-awesome-button";
import {useRouter} from "next/router";

const checkSymbol = ['❌', '✅', '🙃']
const initialCheck = {ok: 0, message: 'Check is not run yet'}
const mecabDefaultDirectory = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': 'C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe'
}

function Home() {
  const router = useRouter();
  const [mecab, setMecab] = useState(mecabDefaultDirectory[process.platform] ?? mecabDefaultDirectory['linux']);
  const [jmdict, setJmdict] = useState('');
  const [check, setCheck] = useState(initialCheck);
  const handleClick = useCallback(async () => {
    if (check.ok === 1) {
      await router.push('/video');
    }
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
    setCheck({
      ok: 2,
      message: "checking..."
    });
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
  const {tokenizeMiteiru} = useMiteiruTokenizer();
  useEffect(() => {
    const fetchData = async () => {
      const test = await tokenizeMiteiru("１００円で　１ポイントに変換できる\nって言ってたしな。");
      console.log(test);
    };

    // fetchData()
  }, []);
  return (
      <React.Fragment>
        <Head>
          <title>Miteiru v{miteiruVersion}</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
          <div
              className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-fit p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
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
              <div className={"flex justify-between  gap-3 p-3 w-full"}>
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
            </ContainerHome>
            <ContainerHome>
              <div className={'flex flex-col justify-center items-center gap-2'}>
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
                <div className={'text-black'}>
                  {checkSymbol[check.ok]}{' '}{check.message}
                </div>


              </div>


            </ContainerHome>
            <ContainerHome>
              <div className={'flex flex-row gap-3'}>
                <AwesomeButton
                    type={"danger"}
                    onPress={handleRemoveJMDictCache}>
                  Remove JMDict Cache
                </AwesomeButton>
                <AwesomeButton type={'primary'} onPress={handleClick}
                               className={check.ok !== 1 ? 'buttonDisabled' : ''}
                               disabled={check.ok !== 1}>
                  Video
                </AwesomeButton>
              </div>
            </ContainerHome>

          </div>
          <KeyboardHelp/>
        </div>
      </React.Fragment>
  );
}

export default Home;
