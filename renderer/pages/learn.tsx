import React, {useCallback, useEffect, useRef, useState} from "react";
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
import useGoogleTranslator from "../hooks/useGoogleTranslator";
import TranslationDisplay from "../components/Subtitle/TranslationDisplay";
import useRubyCopy from "../hooks/useRubyCopy";
import {SentenceList} from "../components/Meaning/SentenceList";

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
  const [rubyContent, setRubyCopyContent] = useRubyCopy();
  const [sentences, setSentences] = useState<string[]>([]);
  const [sentenceInput, setSentenceInput] = useState('');
  const handleSentenceClick = useCallback((sentence: string) => {
    setDirectInput(sentence);
  }, [setDirectInput]);

  useLearningKeyBind(setMeaning, setShowSidebar, undo, rubyContent);
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
  } = useTranslationLinks(directInput, lang);

  const {
    translate
  } = useGoogleTranslator();

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
  }, [tokenizerMode, directInput, lang, tokenizeMiteiru]);

  const [translation, setTranslation] = useState('');
  const [isAutoTranslating, setIsAutoTranslating] = useState(false);
  const lastTranslatedInput = useRef('');
  const lastTranslationTime = useRef(0);

  const handleTranslate = useCallback(async (forceTranslate = false) => {
    const currentTime = Date.now();
    if (forceTranslate || (directInput !== lastTranslatedInput.current && currentTime - lastTranslationTime.current >= 1000)) {
      try {
        const result = await translate(directInput, lang);
        setTranslation(result.translatedText);
        lastTranslatedInput.current = directInput;
        lastTranslationTime.current = currentTime;
      } catch (error) {
        console.error('Translation failed:', error);
        setTranslation('Translation failed. Please try again.');
      }
    }
  }, [directInput, lang, translate]);

  useEffect(() => {
    let interval;
    if (isAutoTranslating) {
      interval = setInterval(() => {
        handleTranslate();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAutoTranslating, handleTranslate]);

  const toggleAutoTranslate = () => {
    setIsAutoTranslating(prev => !prev);
  };

  // New function to split text into sentences
  const splitIntoSentences = useCallback((text: string) => {
    return text.split(/[\n\t]+/).filter(sentence => sentence.trim() !== '');
  }, []);

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
              className={"flex flex-col min-h-screen w-full items-center justify-end bg-blue-50 gap-4 p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              <div className="flex-grow overflow-y-auto">
                <div className="container mx-auto px-4 py-8">
                  <div className={"flex flex-col items-center justify-center gap-4"}>
              <textarea
                  className={"text-black m-auto p-4 min-w-[40vw]"}
                  value={sentenceInput}
                  onChange={val => {
                    setSentenceInput(val.target.value)
                    setSentences(splitIntoSentences(val.target.value))
                  }}
              />
                    <SentenceList sentences={sentences} onSentenceClick={handleSentenceClick}/>
                    <div className="flex gap-4">
                      <AwesomeButton type={'primary'} onPress={openDeepL}>
                        Translate with DeepL
                      </AwesomeButton>
                      <AwesomeButton type={'primary'} onPress={openGoogleTranslate}>
                        Translate with Google
                      </AwesomeButton>
                      <AwesomeButton type={'primary'} onPress={() => handleTranslate(true)}>
                        Translate Now
                      </AwesomeButton>
                      <AwesomeButton type={isAutoTranslating ? 'secondary' : 'primary'}
                                     onPress={toggleAutoTranslate}>
                        {isAutoTranslating ? 'Stop Auto Translate' : 'Start Auto Translate'}
                      </AwesomeButton>
                    </div>
                    <TranslationDisplay translation={translation}/>
                    <AwesomeButton
                        type={'secondary'}
                        onPress={async () => {
                          await router.push('/video')
                        }}
                    >
                      Back to Video
                    </AwesomeButton>
                    <PrimarySubtitle
                        setMeaning={setMeaning}
                        currentTime={currentTime}
                        subtitle={primarySub}
                        shift={0}
                        subtitleStyling={primaryStyling}
                        getLearningStateClass={getLearningStateClass}
                        changeLearningState={changeLearningState}
                        setRubyCopyContent={setRubyCopyContent}
                    />
                    <div className="text-black mt-8 w-full max-w-2xl">

                    </div>
                  </div>
                </div>
              </div>

            </ContainerHome>
          </div>
          <LearningSidebar
              showSidebar={showSidebar}
              setShowSidebar={setShowSidebar}
              primaryStyling={primaryStyling}
              setPrimaryStyling={setPrimaryStyling}
              lang={lang}
          />
        </div>
      </React.Fragment>
  )
}

export default Learn;