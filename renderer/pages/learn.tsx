import React, {useEffect, useState} from "react";
import Head from "next/head";
import {ContainerHome} from "../components/ContainerHome";
import {PrimarySubtitle} from "../components/Subtitle";
import {setGlobalSubtitleId, SubtitleContainer} from "../components/DataStructures";
import {ipcRenderer} from "electron";
import {defaultLearningStyling} from "../utils/CJKStyling";
import MeaningBox from "../components/MeaningBox";
import useMeaning from "../hooks/useMeaning";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import useMenuDisplay from "../hooks/useMenuDisplay";
import {Sidebar} from "../components/Sidebar";
import Toggle from "../components/Toggle";


function Learn() {

  const {meaning, setMeaning} = useMeaning();
  const [currentTime, setCurrentTime] = useState(0);
  const [mecab, setMecab] = useState('')
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer(''))
  const [directInput, setDirectInput] = useState('');
  useEffect(() => {
    ipcRenderer.invoke('getTokenizerMode').then(val => {
      setMecab(val)
    })
  }, []);
  useEffect(() => {
    if (mecab !== '') {
      const tmpSub = (new SubtitleContainer(directInput))
      setPrimarySub(tmpSub)
      setGlobalSubtitleId(tmpSub.id);
      tmpSub.adjustJapanese(tokenizeMiteiru).then(() => {
        setCurrentTime(old => (old ^ 1))
      })
    }
  }, [mecab, directInput])

  const {tokenizeMiteiru} = useMiteiruTokenizer();

  const [showRomaji, setShowRomaji] = useState(false)

  return (
      <React.Fragment>
        <Head>
          <title>Miteiru</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>

          <MeaningBox meaning={meaning} setMeaning={setMeaning} tokenizeMiteiru={tokenizeMiteiru}/>
          <div
              className={"flex flex-col h-[100vh] w-full items-center justify-end bg-blue-50 gap-4 p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              <div className={"flex flex-col items-center justify-center gap-4"}>

                <textarea className={"text-black m-auto p-4 min-w-[40vw]"} value={directInput}
                          onChange={val => {
                            setDirectInput(val.target.value)
                          }}></textarea>
                <Toggle defaultCheck={showRomaji} onChange={(val) => {
                  setShowRomaji(val)
                }}/>
                <PrimarySubtitle setMeaning={setMeaning}
                                 currentTime={currentTime}
                                 subtitle={primarySub}
                                 shift={0}
                                 subtitleStyling={{
                                   ...defaultLearningStyling,
                                   showRomaji: showRomaji
                                 }}/>

              </div>
            </ContainerHome>

          </div>
        </div>
      </React.Fragment>
  )
}

export default Learn;