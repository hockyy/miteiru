import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
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
import {FaVolumeUp} from 'react-icons/fa';
import useSpeech from "../hooks/useSpeech";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const handleSentenceClick = useCallback((sentence: string) => {
    setDirectInput(sentence);
  }, [setDirectInput]);

  const [selectedVoice, setSelectedVoice] = useStoreData('tts.option.voice','');
  const [openRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel] = useStoreData('openrouter.model', 'anthropic/claude-3.5-sonnet');
  
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
    getLearningState,
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
      } else if (tmpSub.language === videoConstants.vietnameseLang) {
        tmpSub.adjustVietnamese(tokenizeMiteiru).then(() => {
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


  const {
    speak,
    speaking,
    supported,
    voices
  } = useSpeech(); // Use the useSpeech hook

  // Function to get supported language codes
  const getSupportedLangCodes = useCallback(() => {
    return Object.values(videoConstants.varLang).flat();
  }, []);
  // Filter voices based on supported languages
  const filteredVoices = useMemo(() => {
    const supportedLangCodes = getSupportedLangCodes();
    return voices.filter(voice =>
        supportedLangCodes.some(langCode => voice.lang.startsWith(langCode))
    );
  }, [getSupportedLangCodes, voices]);

  const handleSpeak = useCallback(() => {
    if (supported) {
      speak(directInput, {
        voice: selectedVoice,
        lang
      });
    }
  }, [speak, supported, directInput, selectedVoice, lang]);

  useEffect(() => {
    if (sentences.length == 1) {
      setDirectInput(sentences[0]);
    }
  }, [sentences]);

  const analyzeWithAI = useCallback(async () => {
    if (!openRouterApiKey) {
      setAiAnalysis('Please set your OpenRouter API key in settings (Ctrl+X)');
      return;
    }
    
    if (!directInput.trim()) {
      setAiAnalysis('Please enter a sentence to analyze');
      return;
    }

    setIsAnalyzing(true);
    setAiAnalysis('');

    try {
      const openrouter = createOpenRouter({ 
        apiKey: openRouterApiKey,
        headers: {
          'HTTP-Referer': 'https://github.com/hockyy/miteiru',
          'X-Title': 'Miteiru'
        }
      });
      
      const model = openrouter(openRouterModel);
      
      const result = await streamText({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a language learning assistant. Analyze the given sentence in detail. Provide:
1. Grammar breakdown: Identify key grammatical structures and explain their usage
2. Vocabulary analysis: Explain important words and their meanings in context
3. Cultural notes: If relevant, mention any cultural aspects
4. Learning tips: Suggest similar patterns or phrases to study

Keep your analysis clear, educational, and focused on helping language learners understand the sentence deeply.`
          },
          {
            role: 'user',
            content: `Please analyze this sentence in detail: "${directInput}"`
          }
        ]
      });

      // Stream the response
      let fullAnalysis = '';
      for await (const chunk of result.textStream) {
        fullAnalysis += chunk;
        setAiAnalysis(fullAnalysis);
      }

    } catch (error) {
      console.error('AI Analysis failed:', error);
      setAiAnalysis(`Analysis failed: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [directInput, openRouterApiKey, openRouterModel]);

  return (
      <React.Fragment>
        <Head>
          <title>Miteiru</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
          <MeaningBox 
                      lang={lang} 
                      meaning={meaning} 
                      setMeaning={setMeaning}
                      tokenizeMiteiru={tokenizeMiteiru}
                      changeLearningState={changeLearningState}
                      getLearningState={getLearningState}
          />
          <div
              className={"flex flex-col min-h-screen w-full items-center bg-blue-50 p-5 border rounded-lg border-blue-800"}>
            <ContainerHome>
              <div className="flex-grow overflow-y-auto w-full">
                <div className="container mx-auto px-4 py-8 max-w-6xl">
                  <div className={"flex flex-col items-center justify-start gap-6"}>
                    
                    {/* Text Input Section */}
                    <div className="w-full max-w-4xl">
                      <h3 className="text-black font-bold text-lg mb-3">Enter Text (one sentence per line)</h3>
                      <textarea
                          className={"text-black w-full p-4 border-2 border-blue-400 rounded-lg min-h-[200px] max-h-[400px] overflow-y-auto resize-y focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors"}
                          value={sentenceInput}
                          onChange={val => {
                            setSentenceInput(val.target.value)
                            setSentences(splitIntoSentences(val.target.value))
                          }}
                          placeholder="Enter your text here. Each line will be treated as a separate sentence."
                      />
                    </div>

                    {/* Sentence List Section */}
                    {sentences.length > 1 && (
                      <div className="w-full max-w-4xl bg-white border-2 border-blue-300 rounded-lg p-4 shadow-sm">
                        <SentenceList sentences={sentences} onSentenceClick={handleSentenceClick}/>
                      </div>
                    )}

                    {/* Current Sentence Display */}
                    <div className="w-full max-w-4xl bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-lg p-6 shadow-md">
                      <h3 className="text-black font-bold text-lg mb-4 text-center">Current Sentence</h3>
                      <div className="relative flex justify-center items-center min-h-[80px]">
                        <style dangerouslySetInnerHTML={{__html: `
                          .learn-subtitle-container > div {
                            position: relative !important;
                            width: 100% !important;
                            top: auto !important;
                            bottom: auto !important;
                          }
                        `}} />
                        <div className="learn-subtitle-container w-full">
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
                        </div>
                      </div>
                    </div>

                    {/* Voice Selection */}
                    <div className="w-full max-w-4xl">
                      <label className="text-black font-semibold mb-2 block">Voice Selection</label>
                      <select
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="text-black p-3 border-2 border-blue-400 rounded-lg w-full focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors cursor-pointer"
                      >
                        <option value="">Default Voice</option>
                        {filteredVoices.map((voice) => (
                            <option key={voice.name} value={voice.name}>
                              {`${voice.name} (${voice.lang})`}
                            </option>
                        ))}
                      </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3 justify-center w-full max-w-4xl items-center">
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
                      <AwesomeButton
                          type={'primary'}
                          onPress={handleSpeak}
                          disabled={!supported || speaking}
                      >
                        {speaking ? 'Speaking...' : <FaVolumeUp/>}
                      </AwesomeButton>
                      <AwesomeButton
                          type={'primary'}
                          onPress={analyzeWithAI}
                          disabled={isAnalyzing || !directInput.trim()}
                      >
                        {isAnalyzing ? 'Analyzing...' : '🤖 AI Analysis'}
                      </AwesomeButton>
                    </div>

                    {/* Translation Display */}
                    {translation && (
                      <div className="w-full max-w-4xl">
                        <TranslationDisplay translation={translation}/>
                      </div>
                    )}

                    {/* AI Analysis Display */}
                    {aiAnalysis && (
                      <div className="w-full max-w-4xl">
                        <style dangerouslySetInnerHTML={{__html: `
                          .ai-markdown h1 { font-size: 1.5em; font-weight: bold; margin: 1em 0 0.5em 0; color: #6b21a8; }
                          .ai-markdown h2 { font-size: 1.3em; font-weight: bold; margin: 0.8em 0 0.4em 0; color: #7c3aed; }
                          .ai-markdown h3 { font-size: 1.1em; font-weight: bold; margin: 0.6em 0 0.3em 0; color: #8b5cf6; }
                          .ai-markdown p { margin: 0.5em 0; line-height: 1.6; }
                          .ai-markdown ul, .ai-markdown ol { margin: 0.5em 0; padding-left: 1.5em; }
                          .ai-markdown li { margin: 0.3em 0; line-height: 1.5; }
                          .ai-markdown code { background: #f3e8ff; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; color: #6b21a8; }
                          .ai-markdown pre { background: #f3e8ff; padding: 1em; border-radius: 5px; overflow-x: auto; margin: 0.5em 0; }
                          .ai-markdown pre code { background: transparent; padding: 0; }
                          .ai-markdown strong { font-weight: 600; color: #581c87; }
                          .ai-markdown em { font-style: italic; color: #6b21a8; }
                          .ai-markdown blockquote { border-left: 3px solid #a855f7; padding-left: 1em; margin: 0.5em 0; color: #6b21a8; font-style: italic; }
                          .ai-markdown table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
                          .ai-markdown th, .ai-markdown td { border: 1px solid #e9d5ff; padding: 0.5em; text-align: left; }
                          .ai-markdown th { background: #f3e8ff; font-weight: 600; }
                          .ai-markdown hr { border: none; border-top: 2px solid #e9d5ff; margin: 1em 0; }
                        `}} />
                        <div className="bg-white border-2 border-purple-500 rounded-lg p-6 shadow-lg">
                          <div className="flex justify-between items-center mb-4 border-b-2 border-purple-200 pb-3">
                            <h3 className="text-purple-900 font-bold text-xl">🤖 AI Analysis</h3>
                            <button
                              onClick={() => setAiAnalysis('')}
                              className="text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-full w-8 h-8 flex items-center justify-center font-bold text-xl transition-colors"
                              title="Close"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="ai-markdown text-black">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {aiAnalysis}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Navigation */}
                    <div className="w-full max-w-4xl flex justify-center mt-4">
                      <AwesomeButton
                          type={'secondary'}
                          onPress={async () => {
                            await router.push('/video')
                          }}
                      >
                        Back to Video
                      </AwesomeButton>
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