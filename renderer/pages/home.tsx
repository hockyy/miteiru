import React, {useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {SubtitleContainer} from "../components/DataStructures";
import {ipcRenderer} from 'electron';

function Home() {
  const tmp = new SubtitleContainer('');
  const [dicdir, setDicdir] = useState('');
  const [check, setCheck] = useState('');
  return (
      <React.Fragment>
        <Head>
          <title>Home - Nextron (with-typescript-tailwindcss)</title>
        </Head>
        <div className={"flex flex-col items-center text-center"}>
          <div className={"flex flex-row gap-3 p-3 rounded-lg text-blue-800 bg-blue-100 w-fit"}>
            <button
                className='bg-blue-400 hover:bg-blue-500 rounded-sm text-white p-2 w-fit'
                onClick={() => {
                  ipcRenderer.invoke('pickDirectory').then((val) => {
                    if (!val.cancelled) setDicdir(val.filePaths[0])
                  })
                }
                }>
              Select Dictionary Directory
            </button>
            <input
                className={"outline-none rounded-sm text-lg w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}
                type={"text"} value={dicdir}
                onChange={(val) => {
                  setDicdir(val.target.value)
                }}></input>
          </div>
          <div>

            <button
                className='bg-blue-400 p-3 rounded-sm hover:bg-blue-500'
                onClick={() => {
                  console.log(dicdir)
                  ipcRenderer.invoke('validateConfig', {
                    dicdir
                  }).then(val => {
                    console.log(val)
                  })
                }
                }>
              Check
            </button>
            <div>{check}</div>
          </div>

        </div>
        <Link href='/video'>
          <a className='btn-blue'>Go to video page</a>
        </Link>
      </React.Fragment>
  );
}

export default Home;
