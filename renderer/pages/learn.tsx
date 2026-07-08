import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import Head from "next/head";
import {PrimarySubtitle} from "../components/Subtitle/Subtitle";
import {setGlobalSubtitleId, SubtitleContainer} from "../components/Subtitle/DataStructures";
import {defaultLearningStyling} from "../utils/CJKStyling";
import MeaningBox from "../components/Meaning/MeaningBox";
import useMeaning from "../hooks/useMeaning";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import {Button} from "../components/Utils/Button";
import {useRouter} from "next/router";
import {LearningSidebar} from "../components/VideoPlayer/LearningSidebar";
import VocabSidebar from "../components/VideoPlayer/VocabSidebar";
import {RIGHT_SIDEBAR_WIDTH, VOCAB_SIDEBAR_WIDTH} from "../components/VideoPlayer/SidebarShell";
import useVocabSidebar from "../hooks/useVocabSidebar";
import {useStoreData} from "../hooks/useStoreData";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import {isLearningSubtitleLanguage} from "../components/Subtitle/subtitleLanguageSupport";
import useLearningState from "../hooks/useLearningState";
import useGoogleTranslator from "../hooks/useGoogleTranslator";
import TranslationDisplay from "../components/Subtitle/TranslationDisplay";
import useRubyCopy from "../hooks/useRubyCopy";
import {SentenceList} from "../components/Meaning/SentenceList";
import {FaVolumeUp} from 'react-icons/fa';
import useSpeech from "../hooks/useSpeech";
import {LearnStudyPanel} from "../components/Learn/LearnStudyPanel";
import {AIAnalysisPanel} from "../components/Learn/AIAnalysisPanel";
import {AnkiCardBuilderPanel} from "../components/Learn/AnkiCardBuilderPanel";
// Learn AI wiring: translation (left) → useAiTranslation | analysis (right) → useSentenceAnalysis
// OpenRouter key/model: LearningSidebar.tsx | OCR (unused here): components/Utils/ImageOCR.tsx
import {useSentenceAnalysis} from "../hooks/useSentenceAnalysis";
import {useSentenceAnki} from "../hooks/useSentenceAnki";
import {splitIntoLines} from "../utils/textUtils";
import {speechLanguageCodes} from "../languages/manifest";
import useLiveCaptions from "../hooks/useLiveCaptions";
import {LiveCaptionOverlay} from "../components/Subtitle/LiveCaptionOverlay";
import {LearnLiveCaptionControl} from "../components/Learn/LearnLiveCaptionControl";

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

  const handleMoveToAnalyzer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    // Keep middle textarea, sentence list, and tokenized preview in sync
    setSentenceInput(trimmed);
    setSentences(splitIntoLines(trimmed));
    setDirectInput(trimmed);
  }, []);

  const handleAppendToAnalyzer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const combined = sentenceInput.trim() ? `${sentenceInput.trim()}\n${trimmed}` : trimmed;
    setSentenceInput(combined);
    setSentences(splitIntoLines(combined));
    setDirectInput(combined);
  }, [sentenceInput]);

  const [leftColumnWidth, setLeftColumnWidth] = useStoreData('learn.layout.leftColumnWidth', 35);
  const [middleColumnWidth, setMiddleColumnWidth] = useStoreData('learn.layout.middleColumnWidth', 45);
  const rightColumnWidth = 100 - leftColumnWidth - middleColumnWidth;

  // Right column vertical split state (percentage for sentences vs AI)
  const [sentencesSectionHeight, setSentencesSectionHeight] = useStoreData('learn.layout.sentencesSectionHeight', 50);

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingVertical, setIsDraggingVertical] = useState(false);

  // Handle left divider drag
  const handleLeftDividerMouseDown = useCallback(() => {
    setIsDraggingLeft(true);
  }, []);

  // Handle right divider drag
  const handleRightDividerMouseDown = useCallback(() => {
    setIsDraggingRight(true);
  }, []);

  // Handle vertical divider drag
  const handleVerticalDividerMouseDown = useCallback(() => {
    setIsDraggingVertical(true);
  }, []);

  // Handle mouse move for resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingLeft) {
      const containerWidth = window.innerWidth;
      const newLeftWidth = (e.clientX / containerWidth) * 100;
      
      // Constrain between 20% and 60%
      if (newLeftWidth >= 20 && newLeftWidth <= 60 && (100 - newLeftWidth - middleColumnWidth) >= 15) {
        setLeftColumnWidth(newLeftWidth);
      }
    } else if (isDraggingRight) {
      const containerWidth = window.innerWidth;
      const newMiddleWidth = ((e.clientX - (leftColumnWidth / 100 * containerWidth)) / containerWidth) * 100;
      
      // Constrain middle column between 30% and 70%, right column minimum 15%
      if (newMiddleWidth >= 30 && newMiddleWidth <= 70 && (100 - leftColumnWidth - newMiddleWidth) >= 15) {
        setMiddleColumnWidth(newMiddleWidth);
      }
    } else if (isDraggingVertical) {
      const containerHeight = window.innerHeight;
      const newSentencesHeight = (e.clientY / containerHeight) * 100;
      
      // Constrain between 20% and 80%
      if (newSentencesHeight >= 20 && newSentencesHeight <= 80) {
        setSentencesSectionHeight(newSentencesHeight);
      }
    }
  }, [isDraggingLeft, isDraggingRight, isDraggingVertical, leftColumnWidth, middleColumnWidth, setLeftColumnWidth, setMiddleColumnWidth, setSentencesSectionHeight]);

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setIsDraggingLeft(false);
    setIsDraggingRight(false);
    setIsDraggingVertical(false);
  }, []);

  // Add/remove mouse event listeners
  useEffect(() => {
    if (isDraggingLeft || isDraggingRight || isDraggingVertical) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isDraggingVertical ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDraggingLeft, isDraggingRight, isDraggingVertical, handleMouseMove, handleMouseUp]);

  const [selectedVoice, setSelectedVoice] = useStoreData('tts.option.voice','');
  const [openRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel] = useStoreData('openrouter.model', 'z-ai/glm-5.2:nitro');
  
  const {
    showVocabSidebar,
    setShowVocabSidebar,
  } = useVocabSidebar();

  useLearningKeyBind(setMeaning, setShowSidebar, undo, rubyContent, setShowVocabSidebar);
  const router = useRouter();
  const {
    tokenizerMode,
    tokenizeMiteiru,
    lang
  } = useMiteiruTokenizer();
  const {
    analysis: sentenceAnalysis,
    errorMessage: analysisErrorMessage,
    isAnalyzing,
    hasAnalysisPanel,
    analyzeSentence,
    clearAnalysis,
  } = useSentenceAnalysis({ openRouterApiKey, openRouterModel, lang });
  const {
    draft: ankiDraft,
    errorMessage: ankiErrorMessage,
    isBuilding: isBuildingAnkiCard,
    isOpening: isOpeningAnkiCard,
    openStatusMessage: ankiOpenStatusMessage,
    hasAnkiBuilderPanel,
    ankiExportModal,
    buildAnkiCard,
    updateDraft: updateAnkiDraft,
    openAnkiCard,
    clearAnkiCard,
  } = useSentenceAnki({ openRouterApiKey, openRouterModel, lang, tokenizeMiteiru });

  const hasBottomPanel = hasAnalysisPanel || hasAnkiBuilderPanel;

  const handleAnalyzeSentence = useCallback(() => {
    clearAnkiCard();
    analyzeSentence(directInput);
  }, [analyzeSentence, clearAnkiCard, directInput]);

  const handleBuildAnkiCard = useCallback(() => {
    clearAnalysis();
    buildAnkiCard(directInput);
  }, [buildAnkiCard, clearAnalysis, directInput]);

  const liveCaptions = useLiveCaptions();
  const visibleLiveCaption = liveCaptions.caption.trim();
  const showManualSentence = !liveCaptions.running || visibleLiveCaption.length === 0;

  useEffect(() => {
    if (!liveCaptions.running) {
      return;
    }
    setDirectInput(liveCaptions.caption);
  }, [liveCaptions.running, liveCaptions.caption]);

  const {
    getLearningStateClass,
    changeLearningState,
    getLearningState,
    refreshTrigger,
  } = useLearningState(lang);

  const {
    translate
  } = useGoogleTranslator();

  useEffect(() => {
    if (tokenizerMode !== '' && tokenizeMiteiru) {
      const tmpSub = (new SubtitleContainer(directInput, lang))
      setPrimarySub(tmpSub)
      setGlobalSubtitleId(tmpSub.id);
      if (isLearningSubtitleLanguage(tmpSub.language)) {
        tmpSub.adjustForLearning(tokenizeMiteiru).then(() => {
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

  const {
    speak,
    speaking,
    supported,
    voices
  } = useSpeech(); // Use the useSpeech hook

  // Function to get supported language codes
  const getSupportedLangCodes = useCallback(() => {
    return Object.values(speechLanguageCodes).flat();
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

  return (
      <React.Fragment>
        {ankiExportModal}
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
                      onMoveToAnalyzer={handleMoveToAnalyzer}
                      sidebarInsets={{
                        left: showVocabSidebar ? VOCAB_SIDEBAR_WIDTH : "0",
                        right: showSidebar ? RIGHT_SIDEBAR_WIDTH : "0",
                      }}
          />
          {/* 3-Column Layout */}
          <div className="flex h-screen w-full relative">
            {/* Left Column - AI Translation */}
            <div
              className="overflow-hidden"
              style={{ width: `${leftColumnWidth}%` }}
            >
              <LearnStudyPanel
                lang={lang}
                openRouterApiKey={openRouterApiKey}
                openRouterModel={openRouterModel}
                onMoveToAnalyzer={handleMoveToAnalyzer}
                onAppendToAnalyzer={handleAppendToAnalyzer}
              />
            </div>

            {/* Left Divider */}
            <div
              className="w-1 bg-blue-400 hover:bg-blue-600 cursor-col-resize transition-colors flex-shrink-0 relative group"
              onMouseDown={handleLeftDividerMouseDown}
            >
              <div className="absolute inset-0 w-4 -mx-1.5" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-blue-600 text-white px-1 py-2 rounded text-xs whitespace-nowrap">
                  ⇄
                </div>
              </div>
            </div>

            {/* Middle Column - Main Content */}
            <div 
              className="flex flex-col overflow-y-auto bg-blue-50"
              style={{ width: `${middleColumnWidth}%` }}
            >
              <div className="flex-1 p-6 space-y-6">
                {/* Text Input Section */}
                <div>
                  <h3 className="text-black font-bold text-lg mb-3">Enter Text (one sentence per line)</h3>
                  <textarea
                      className={"text-black w-full p-4 border-2 border-blue-400 rounded-lg min-h-[150px] resize-y focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors"}
                      value={sentenceInput}
                      onChange={val => {
                        setSentenceInput(val.target.value)
                        setSentences(splitIntoLines(val.target.value))
                      }}
                      placeholder="Enter your text here. Each line will be treated as a separate sentence."
                  />
                </div>

                {/* Current Sentence Display */}
                <LearnLiveCaptionControl
                  supported={liveCaptions.supported}
                  running={liveCaptions.running}
                  starting={liveCaptions.starting}
                  state={liveCaptions.state}
                  error={liveCaptions.error}
                  refreshIntervalMs={liveCaptions.refreshIntervalMs}
                  onRefreshIntervalChange={liveCaptions.setRefreshIntervalMs}
                  onToggle={liveCaptions.toggle}
                />

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-lg p-6 shadow-md">
                  <h3 className="text-black font-bold text-lg mb-4 text-center">
                    {liveCaptions.running ? 'Live Caption' : 'Current Sentence'}
                  </h3>
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
                      {liveCaptions.running && visibleLiveCaption ? (
                        <LiveCaptionOverlay
                          caption={liveCaptions.caption}
                          subtitleStyling={primaryStyling}
                          lang={lang}
                          tokenizeMiteiru={tokenizeMiteiru}
                          setMeaning={setMeaning}
                          getLearningStateClass={getLearningStateClass}
                          changeLearningState={changeLearningState}
                          setRubyCopyContent={setRubyCopyContent}
                        />
                      ) : showManualSentence ? (
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
                      ) : (
                        <div className="text-sm text-blue-600 text-center italic">
                          Waiting for live captions...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Voice Selection */}
                <div>
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
                <div className="flex flex-wrap gap-3 justify-center items-center">
                      <Button type={'primary'} onPress={() => handleTranslate(true)}>
                        Translate Now
                      </Button>
                      <Button type={isAutoTranslating ? 'secondary' : 'primary'}
                                     onPress={toggleAutoTranslate}>
                        {isAutoTranslating ? 'Stop Auto Translate' : 'Start Auto Translate'}
                      </Button>
                      <Button
                          type={'primary'}
                          onPress={handleSpeak}
                          disabled={!supported || speaking}
                      >
                        {speaking ? 'Speaking...' : <FaVolumeUp/>}
                      </Button>
                      <Button
                          type={'primary'}
                          onPress={handleAnalyzeSentence}
                          disabled={isAnalyzing || !directInput.trim()}
                      >
                        {isAnalyzing ? 'Analyzing...' : '🤖 AI Analysis'}
                      </Button>
                      <Button
                          type={'primary'}
                          onPress={handleBuildAnkiCard}
                          disabled={isBuildingAnkiCard || !directInput.trim() || !tokenizeMiteiru}
                      >
                        {isBuildingAnkiCard ? 'Building...' : '📇 Build Anki Card'}
                      </Button>
                    </div>

                {/* Translation Display */}
                {translation && (
                  <div>
                    <TranslationDisplay translation={translation}/>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex justify-center mt-4">
                  <Button
                      type={'secondary'}
                      onPress={async () => {
                        await router.push('/video')
                      }}
                  >
                    Back to Video
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Divider */}
            <div
              className="w-1 bg-blue-400 hover:bg-blue-600 cursor-col-resize transition-colors flex-shrink-0 relative group"
              onMouseDown={handleRightDividerMouseDown}
            >
              <div className="absolute inset-0 w-4 -mx-1.5" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-blue-600 text-white px-1 py-2 rounded text-xs whitespace-nowrap">
                  ⇄
                </div>
              </div>
            </div>

            {/* Right Column - Sentence List & AI Analysis */}
            <div 
              className="flex flex-col bg-white overflow-hidden"
              style={{ width: `${rightColumnWidth}%` }}
            >
              {/* Sentences Section */}
              <div 
                className="flex flex-col overflow-hidden"
                style={{ height: hasBottomPanel ? `${sentencesSectionHeight}%` : '100%' }}
              >
                <div className="p-4 border-b-2 border-blue-400 bg-blue-100 flex-shrink-0">
                  <h3 className="text-black font-bold text-lg">Sentences</h3>
                  {sentences.length > 0 && (
                    <p className="text-sm text-blue-600 mt-1">{sentences.length} sentence{sentences.length !== 1 ? 's' : ''}</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sentences.length > 1 ? (
                    <div className="p-4">
                      <SentenceList sentences={sentences} onSentenceClick={handleSentenceClick}/>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-400">
                      <div className="text-4xl mb-2">📝</div>
                      <div className="text-sm">No sentences yet</div>
                      <div className="text-xs mt-1">Enter text with multiple lines</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Vertical Divider */}
              {hasBottomPanel && (
                <div
                  className="h-1 bg-blue-400 hover:bg-blue-600 cursor-row-resize transition-colors flex-shrink-0 relative group"
                  onMouseDown={handleVerticalDividerMouseDown}
                >
                  <div className="absolute inset-0 h-4 -my-1.5" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-blue-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap">
                      ⇅
                    </div>
                  </div>
                </div>
              )}

              {hasBottomPanel && (
                <div
                  className="flex flex-col overflow-hidden"
                  style={{ height: `${100 - sentencesSectionHeight}%` }}
                >
                  {hasAnkiBuilderPanel ? (
                    <AnkiCardBuilderPanel
                      draft={ankiDraft}
                      isBuilding={isBuildingAnkiCard}
                      isOpening={isOpeningAnkiCard}
                      openStatusMessage={ankiOpenStatusMessage}
                      errorMessage={ankiErrorMessage ?? undefined}
                      onUpdateDraft={updateAnkiDraft}
                      onOpen={openAnkiCard}
                      onClose={clearAnkiCard}
                    />
                  ) : (
                    <AIAnalysisPanel
                      analysis={sentenceAnalysis}
                      isAnalyzing={isAnalyzing}
                      errorMessage={analysisErrorMessage ?? undefined}
                      onClose={clearAnalysis}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          <VocabSidebar
              showVocabSidebar={showVocabSidebar}
              setShowVocabSidebar={setShowVocabSidebar}
              lang={lang}
              setMeaning={setMeaning}
              tokenizeMiteiru={tokenizeMiteiru}
              refreshTrigger={refreshTrigger}
          />
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