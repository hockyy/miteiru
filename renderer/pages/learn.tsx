import React, {useEffect, useState} from "react";
import Head from "next/head";
import {ContainerHome} from "../components/VideoPlayer/ContainerHome";
import {PrimarySubtitle} from "../components/Subtitle/Subtitle";
import {setGlobalSubtitleId, SubtitleContainer} from "../components/Subtitle/DataStructures";
import {defaultLearningStyling} from "../utils/CJKStyling";
import MeaningBox from "../components/Meaning/MeaningBox";
import useMeaning from "../hooks/useMeaning";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import {AwesomeButton} from "react-awesome-button";
import {useRouter} from "next/router";
import {LearningSidebar} from "../components/VideoPlayer/LearningSidebar";
import {useStoreData} from "../hooks/useStoreData";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import 'react-awesome-button/dist/styles.css';
import {videoConstants} from "../utils/constants";
import useLearningState from "../hooks/useLearningState";
import useTranslationLinks from "../hooks/useTranslationLinks";
import 'react-awesome-button/dist/styles.css';

function Learn() {

  const {
    meaning,
    setMeaning,
    undo
  } = useMeaning();
  const [currentTime, setCurrentTime] = useState(0);
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer(''))
  const [directInput, setDirectInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(0)
  const [primaryStyling, setPrimaryStyling] = useStoreData('user.styling.learning', defaultLearningStyling);
  useLearningKeyBind(setMeaning, setShowSidebar, undo)
  const router = useRouter();
  const {
    tokenizerMode,
    tokenizeMiteiru,
    lang
  } = useMiteiruTokenizer();
  const {
    getLearningStateClass,
    changeLearningState,
  } = useLearningState(lang);

  const {
    openDeepL,
    openGoogleTranslate
  } = useTranslationLinks(directInput); // Use the custom hook

  useEffect(() => {
    if (tokenizerMode !== '' && tokenizeMiteiru) {
      const tmpSub = (new SubtitleContainer(directInput, lang))
      setPrimarySub(tmpSub)
      setGlobalSubtitleId(tmpSub.id);
      if (tmpSub.language === videoConstants.japaneseLang) {
        tmpSub.adjustJapanese(tokenizeMiteiru).then(() => {
          setCurrentTime(old => (old ^ 1))
        })
      } else {
        tmpSub.adjustChinese(tokenizeMiteiru).then(() => {
          setCurrentTime(old => (old ^ 1))
        })
      }
    }
  }, [tokenizerMode, directInput, lang, tokenizeMiteiru])

  return (
      <React.Fragment>
        <Head>
          <title>Miteiru</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>

          <MeaningBox lang={lang} meaning={meaning} setMeaning={setMeaning}
                      tokenizeMiteiru={tokenizeMiteiru}/>
          <div
              className={"flex flex-col h-[100vh] w-full items-center justify-end bg-blue-50 gap-4 p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              <div className={"flex flex-col items-center justify-center gap-4"}>
                <textarea className={"text-black m-auto p-4 min-w-[40vw]"} value={directInput}
                          onChange={val => {
                            setDirectInput(val.target.value)
                          }}></textarea>
                <div className="flex gap-4">
                  <AwesomeButton type={'primary'} onPress={openDeepL}>
                    Translate with DeepL
                  </AwesomeButton>
                  <AwesomeButton type={'primary'} onPress={openGoogleTranslate}>
                    Translate with Google
                  </AwesomeButton>
                </div>
                <AwesomeButton
                    type={'secondary'}
                    onPress={async () => {
                      await router.push('/video')
                    }
                    }>
                  Back to Video
                </AwesomeButton>
                <PrimarySubtitle setMeaning={setMeaning}
                                 currentTime={currentTime}
                                 subtitle={primarySub}
                                 shift={0}
                                 subtitleStyling={primaryStyling}
                                 getLearningStateClass={getLearningStateClass}
                                 changeLearningState={changeLearningState}/>

              </div>
            </ContainerHome>

          </div>
          <LearningSidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar}
                           primaryStyling={primaryStyling}
                           setPrimaryStyling={setPrimaryStyling} lang={lang}/>
        </div>
      </React.Fragment>
  )
}

export default Learn;