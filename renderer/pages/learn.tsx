import React, {useEffect, useState} from "react";
import Head from "next/head";
import {ContainerHome} from "../components/ContainerHome";
import {PrimarySubtitle} from "../components/Subtitle";
import {SubtitleContainer} from "../components/DataStructures";
import {defaultPrimarySubtitleStyling} from "../utils/CJKStyling";
import MeaningBox from "../components/MeaningBox";
import useMeaning from "../hooks/useMeaning";
import {useMiteiruApi} from "../hooks/useMiteiruApi";


function Learn() {

  const {miteiruApi} = useMiteiruApi();
  const {meaning, setMeaning} = useMeaning();
  const [currentTime, setCurrentTime] = useState(0);
  const [mecab, setMecab] = useState('')
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab, miteiruApi))
  const [primaryStyling] = useState(defaultPrimarySubtitleStyling);
  const [directInput, setDirectInput] = useState('');
  useEffect(() => {
    miteiruApi.invoke('getMecabCommand').then(val => {
      setMecab(val)
    })
  }, []);
  useEffect(() => {
    if (mecab !== '') {
      setPrimarySub(new SubtitleContainer(directInput, mecab, miteiruApi.shunou.getFurigana))
      setCurrentTime(old => (old ^ 1))
    }
  }, [mecab, directInput])

  return (
      <React.Fragment>
        <Head>
          <title>Miteiru</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>

          <MeaningBox meaning={meaning} setMeaning={setMeaning} mecab={mecab}
                      miteiruApi={miteiruApi}/>
          <div
              className={"flex flex-col h-[100vh] w-full items-center bg-blue-50 gap-4 p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              <div className={"flex flex-col items-center justify-center gap-4"}>

                <textarea className={"text-black m-auto p-4 min-w-[40vw]"} value={directInput}
                          onChange={val => {
                            setDirectInput(val.target.value)
                          }}></textarea>
                <PrimarySubtitle setMeaning={setMeaning}
                                 currentTime={currentTime}
                                 subtitle={primarySub}
                                 shift={0}
                                 subtitleStyling={primaryStyling}/>

              </div>
            </ContainerHome>

          </div>
        </div>
      </React.Fragment>
  )
}

export default Learn;