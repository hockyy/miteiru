import React, {useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {SubtitleContainer} from "../components/DataStructures";
import {ipcRenderer} from 'electron';
import {ContainerHome} from "../components/ContainerHome";

function Home() {
  const tmp = new SubtitleContainer('');
  const [dicdir, setDicdir] = useState('');
  const [jmdict, setJmdict] = useState('');
  const [check, setCheck] = useState('');
  return (
      <React.Fragment>
        <Head>
          <title>Home - Nextron (with-typescript-tailwindcss)</title>
        </Head>
        <div className={"flex flex-col items-center text-center bg-white gap-3"}>
          <ContainerHome>
            <div className={"flex flex-row gap-3 p-3 w-fit"}>
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
                  className='bg-amber-600 p-3 rounded-sm hover:bg-amber-700'
                  onClick={() => {
                    console.log(dicdir)
                    ipcRenderer.invoke('validateConfig', {
                      dicdir, jmdict
                    }).then(val => {
                      console.log(val);
                      if (val.ok) setCheck('OK')
                      else setCheck(val.message)
                    })
                  }
                  }>
                Check
              </button>
              <div className={'text-black'}>
                {check}
              </div>
            </div>
          </ContainerHome>

        </div>
        <Link href='/video'>
          <a className='btn-blue'>Go to video page</a>
        </Link>
      </React.Fragment>
  );
}

export default Home;
