import React, {useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {SubtitleContainer} from "../components/DataStructures";
import {ipcRenderer} from 'electron';
import {ContainerHome} from "../components/ContainerHome";

const checkSymbol = ['❌', '✅', '🙃']

function Home() {
  const tmp = new SubtitleContainer('');
  const [dicdir, setDicdir] = useState('');
  const [jmdict, setJmdict] = useState('');
  const [check, setCheck] = useState({ok: 0, message: 'Check is not run yet'});
  return (
      <React.Fragment>
        <Head>
          <title>Home - Nextron (with-typescript-tailwindcss)</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white h-[100vh] w-[100vw]"}>
          <div
              className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-fit p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              <div className={"flex flex-row gap-3 p-3"}>
                <button
                    className='bg-blue-400 hover:bg-blue-500 rounded-sm text-white p-2 w-full'
                    onClick={() => {
                      ipcRenderer.invoke('pickDirectory').then((val) => {
                        if (!val.canceled) setDicdir(val.filePaths[0])
                      })
                    }
                    }>
                  Select MeCab Dictionary Directory
                </button>
                <input
                    className={"text-blue-800 outline-none rounded-sm text-lg md:min-w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}
                    type={"text"} value={dicdir}
                    onChange={(val) => {
                      setDicdir(val.target.value)
                    }}></input>
              </div>
              <div className={"flex justify-between  gap-3 p-3 w-full"}>
                <button
                    className='bg-blue-400 hover:bg-blue-500 rounded-sm text-white p-2 w-full'
                    onClick={() => {
                      ipcRenderer.invoke('pickFile', ['json']).then((val) => {
                        if (!val.canceled) setJmdict(val.filePaths[0])
                      })
                    }
                    }>
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
              <div className={'flex flex-row justify-center items-center gap-2'}>

                <button
                    disabled={check.ok === 2}
                    className='disabled:bg-amber-500 enabled:bg-amber-600 p-3 rounded-sm enabled:hover:bg-amber-700'
                    onClick={() => {
                      setCheck({ok: 2, message: 'checking...'})
                      ipcRenderer.invoke('validateConfig', {
                        dicdir, jmdict
                      }).then(val => {
                        setCheck(val)
                      })
                    }
                    }>
                  Check
                </button>
                <div className={'text-black'}>
                  {checkSymbol[check.ok]}{' '}{check.message}
                </div>
              </div>

            </ContainerHome>
            <ContainerHome>
              <button
                  type={"button"}
                  className='bg-green-600 p-3 rounded-sm bg-green-700'
                  onClick={() => {
                    ipcRenderer.invoke('appDataPath').then(val => {
                      console.log(val)
                    })
                  }
                  }>

                tmp
              </button>
              <button
                  type={"button"}
                  className='bg-green-600 p-3 rounded-sm bg-green-700'
                  onClick={() => {
                    ipcRenderer.invoke('appDataPath').then(val => {
                      console.log(val)
                    })
                  }
                  }>

                tmp
              </button>
              <Link href='/video'>
                <button
                    type={"button"}
                    disabled={check.ok !== 1}
                    className='disabled:cursor-not-allowed disabled:bg-green-300 enabled:bg-green-600 p-3 rounded-sm enabled:hover:bg-green-700'>
                  Video
                </button>
              </Link>
            </ContainerHome>

          </div>
        </div>
      </React.Fragment>
  );
}

export default Home;
