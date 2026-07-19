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
import {getMiteiruAppName} from "../utils/utils";
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
import {
  MiteiruActionBar,
  MiteiruPanel,
  MiteiruSubtitleSlot,
  UI_COLUMN_BG,
  UI_SELECT,
  UI_TEXTAREA,
} from "../components/UI";

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
  } = useSentenceAnki({ openRouterApiKey, openRouterModel, lang });

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

  const handleCopyLiveCaptionToAnalyzer = useCallback(() => {
    handleMoveToAnalyzer(liveCaptions.caption);
  }, [handleMoveToAnalyzer, liveCaptions.caption]);

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
          <title>{getMiteiruAppName()}</title>
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
              className={`flex flex-col overflow-y-auto ${UI_COLUMN_BG}`}
              style={{ width: `${middleColumnWidth}%` }}
            >
              <div className="flex-1 space-y-3 p-3">
                <MiteiruPanel label="Enter text (one sentence per line)">
                  <textarea
                    className={UI_TEXTAREA}
                    value={sentenceInput}
                    onChange={val => {
                      setSentenceInput(val.target.value)
                      setSentences(splitIntoLines(val.target.value))
                    }}
                    placeholder="Each line becomes a separate sentence."
                  />
                </MiteiruPanel>

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

                <MiteiruPanel>
                  <MiteiruSubtitleSlot>
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
                  </MiteiruSubtitleSlot>
                </MiteiruPanel>

                {liveCaptions.running && (
                  <MiteiruPanel
                    variant="live"
                    headerAction={
                      <Button
                        type="link"
                        size="small"
                        onPress={handleCopyLiveCaptionToAnalyzer}
                        disabled={!visibleLiveCaption}
                      >
                        → Analyzer
                      </Button>
                    }
                  >
                    <MiteiruSubtitleSlot padX>
                      {visibleLiveCaption ? (
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
                      ) : (
                        <div className="text-xs italic text-green-700 text-center">
                          Waiting for live captions…
                        </div>
                      )}
                    </MiteiruSubtitleSlot>
                  </MiteiruPanel>
                )}

                <MiteiruActionBar
                  top={
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      title="Voice selection"
                      className={UI_SELECT}
                    >
                      <option value="">Default Voice</option>
                      {filteredVoices.map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {`${voice.name} (${voice.lang})`}
                        </option>
                      ))}
                    </select>
                  }
                >
                  <Button type="primary" size="small" onPress={() => handleTranslate(true)}>
                    Translate
                  </Button>
                  <Button
                    type={isAutoTranslating ? 'secondary' : 'primary'}
                    size="small"
                    onPress={toggleAutoTranslate}
                  >
                    {isAutoTranslating ? 'Stop Auto' : 'Auto Translate'}
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    onPress={handleSpeak}
                    disabled={!supported || speaking}
                  >
                    {speaking ? '…' : <FaVolumeUp/>}
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    onPress={handleAnalyzeSentence}
                    disabled={isAnalyzing || !directInput.trim()}
                  >
                    {isAnalyzing ? '…' : '🤖 Analyze'}
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    className="sm:col-span-2"
                    onPress={handleBuildAnkiCard}
                    disabled={isBuildingAnkiCard || !directInput.trim()}
                  >
                    {isBuildingAnkiCard ? 'Building…' : '📇 Build Anki'}
                  </Button>
                </MiteiruActionBar>

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
                className="flex min-h-0 flex-col overflow-hidden p-2"
                style={{ height: hasBottomPanel ? `${sentencesSectionHeight}%` : '100%' }}
              >
                <MiteiruPanel
                  fill
                  label="Sentences"
                  headerAction={
                    sentences.length > 0 ? (
                      <span className="text-[11px] font-semibold normal-case tracking-normal text-blue-800">
                        {sentences.length} line{sentences.length !== 1 ? 's' : ''}
                      </span>
                    ) : undefined
                  }
                  className="h-full"
                  bodyClassName="p-2"
                >
                  {sentences.length > 1 ? (
                    <SentenceList sentences={sentences} onSentenceClick={handleSentenceClick}/>
                  ) : (
                    <div className="py-8 text-center text-blue-400">
                      <div className="mb-2 text-4xl">📝</div>
                      <div className="text-sm">No sentences yet</div>
                      <div className="mt-1 text-xs">Enter text with multiple lines</div>
                    </div>
                  )}
                </MiteiruPanel>
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
                  className="flex min-h-0 flex-col overflow-hidden p-2 pt-0"
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
              tokenizeMiteiru={tokenizeMiteiru}
          />
        </div>
      </React.Fragment>
  )
}

export default Learn;