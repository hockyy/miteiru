import React, {useCallback, useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {ipcRenderer} from 'electron';
import {ContainerHome} from "../components/ContainerHome";
import {KeyboardHelp} from "../components/KeyboardHelp";

const checkSymbol = ['❌', '✅', '🙃']
const initialCheck = {ok: 0, message: 'Check is not run yet'}
const mecabDefaultDirectory = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': 'C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe'
}

function Home() {
  const [dicdir, setDicdir] = useState('');
  const [mecab, setMecab] = useState(mecabDefaultDirectory[process.platform] ?? mecabDefaultDirectory['linux']);
  const [jmdict, setJmdict] = useState('');
  const [check, setCheck] = useState(initialCheck);

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
      mecab, dicdir, jmdict, cached
    }).then(val => {
      setCheck(val);
    });
  }, [mecab, dicdir, jmdict]);

  const handleRemoveJMDictCache = useCallback(() => {
    setCheck({
      ok: 2,
      message: 'Removing JMDict Cache'
    });
    ipcRenderer.invoke('removeDictCache').then(() => {
      setCheck(initialCheck);
    });
  }, []);
  return (
      <React.Fragment>
        <Head>
          <title>Miteiru</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
          <div
              className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-fit p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              {/*<div className={"flex flex-row gap-3 p-3"}>*/}
              {/*  <button*/}
              {/*      className='bg-blue-400 hover:bg-blue-500 rounded-sm text-white p-2 w-full'*/}
              {/*      onClick={() => {*/}
              {/*        ipcRenderer.invoke('pickDirectory').then((val) => {*/}
              {/*          if (!val.canceled) setDicdir(val.filePaths[0])*/}
              {/*        })*/}
              {/*      }*/}
              {/*      }>*/}
              {/*    Select MeCab Dictionary Directory*/}
              {/*  </button>*/}
              {/*  <input*/}
              {/*      className={"text-blue-800 outline-none rounded-sm text-lg md:min-w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}*/}
              {/*      type={"text"} value={dicdir}*/}
              {/*      onChange={(val) => {*/}
              {/*        setDicdir(val.target.value)*/}
              {/*      }}></input>*/}
              {/*</div>*/}
              <div className={"flex justify-between  gap-3 p-3 w-full"}>
                <button
                    className='bg-blue-400 hover:bg-blue-500 rounded-sm text-white p-2 w-full'
                    onClick={handleSelectMecabPath}>
                  Select Mecab Path
                </button>
                <input
                    className={"text-blue-800 outline-none rounded-sm text-lg md:min-w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}
                    type={"text"} value={mecab}
                    onChange={(val) => {
                      setMecab(val.target.value)
                    }}></input>
              </div>
              <div className={"flex justify-between  gap-3 p-3 w-full"}>
                <button
                    className='bg-blue-400 hover:bg-blue-500 rounded-sm text-white p-2 w-full'
                    onClick={handleSelectJMDictJson}>
                  Select JMDict Json
                </button>
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
                  <button
                      disabled={check.ok === 2}
                      className='disabled:cursor-not-allowed disabled:bg-amber-200 enabled:bg-amber-600 p-3 rounded-sm enabled:hover:bg-amber-700'
                      onClick={() => handleCheck(false)}>
                    Check
                  </button>
                  <button
                      disabled={check.ok === 2}
                      className='disabled:cursor-not-allowed disabled:bg-amber-200 enabled:bg-amber-600 p-3 rounded-sm enabled:hover:bg-amber-700'
                      onClick={() => handleCheck(true)}>
                    Check With Cache
                  </button>
                </div>
                <div className={'text-black'}>
                  {checkSymbol[check.ok]}{' '}{check.message}
                </div>


              </div>


            </ContainerHome>
            <ContainerHome>
              <div className={'flex flex-row gap-3'}>
                <button
                    type={"button"}
                    className='bg-red-600 p-3 rounded-sm hover:bg-red-700'
                    onClick={handleRemoveJMDictCache}>
                  Remove JMDict Cache
                </button>
                {/*<button*/}
                {/*    type={"button"}*/}
                {/*    className='bg-green-600 p-3 rounded-sm bg-green-700'*/}
                {/*    onClick={() => {*/}
                {/*      const text = '木ぃ切って 月収6万だろ~'*/}
                {/*      ipcRenderer.invoke('getShunou', mecab, text).then(val => {*/}
                {/*        console.log(val)*/}
                {/*      })*/}
                {/*    }*/}
                {/*    }>*/}
                {/*  tmp*/}
                {/*</button>*/}
                <Link href='/video'>
                  <button
                      type={"button"}
                      disabled={check.ok !== 1}
                      className='disabled:cursor-not-allowed disabled:bg-green-300 enabled:bg-green-600 p-3 rounded-sm enabled:hover:bg-green-700'>
                    Video
                  </button>
                </Link>
              </div>
            </ContainerHome>

          </div>
          <KeyboardHelp/>
        </div>
      </React.Fragment>
  );
}

export default Home;
