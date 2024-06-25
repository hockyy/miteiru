import React, {useCallback, useEffect, useState} from "react";
import {ipcRenderer} from 'electron';
import QuizDisplay from "../components/Meaning/QuizDisplay";
import {videoConstants} from "../utils/constants";
import {AwesomeButton} from "react-awesome-button";
import 'react-awesome-button/dist/styles.css';
import Head from "next/head";
import useMeaning from "../hooks/useMeaning";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import MeaningBox from "../components/Meaning/MeaningBox";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import {LearningSidebar} from "../components/VideoPlayer/LearningSidebar";
import {defaultLearningStyling} from "../utils/CJKStyling";
import {useStoreData} from "../hooks/useStoreData";

const SRS = () => {

  const {
    meaning,
    setMeaning,
    undo
  } = useMeaning();
  const {
    tokenizeMiteiru,
    lang
  } = useMiteiruTokenizer();
  const [showSidebar, setShowSidebar] = useState(0);
  useLearningKeyBind(setMeaning, setShowSidebar, undo)

  const [currentCharacter, setCurrentCharacter] = useState('学');
  const [mode, setMode] = useState('help');
  const [hanziProgress, setHanziProgress] = useState(null);
  const [primaryStyling, setPrimaryStyling] = useStoreData('user.styling.learning', defaultLearningStyling);

  useEffect(() => {
    if (currentCharacter) {
      const fetchProgress = async () => {
        const progress = await ipcRenderer.invoke('loadSRSState', videoConstants.chineseLang);
        setHanziProgress(progress[currentCharacter] || {
          level: {reading: 0, meaning: 0, writing: 0},
          timeCreated: Date.now(),
          timeUpdated: {reading: Date.now(), meaning: Date.now(), writing: Date.now()}
        });
      };
      fetchProgress();
    }
  }, [currentCharacter]);

  const handleStartPractice = useCallback(async (char) => {
    setCurrentCharacter(char);
    await ipcRenderer.invoke('updateSRSContent', char, 'chinese', {
      level: {reading: 0, meaning: 0, writing: 0},
      timeCreated: Date.now(),
      timeUpdated: {reading: Date.now(), meaning: Date.now(), writing: Date.now()}
    });
  }, []);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
  }, []);

  return (
      <React.Fragment>
        <Head>
          <title>SRS</title>
        </Head>
        <div
            className="flex flex-col items-center justify-center bg-blue-50 text-black min-h-screen p-6">

          <MeaningBox lang={lang} meaning={meaning} setMeaning={setMeaning}
                      tokenizeMiteiru={tokenizeMiteiru}/>
          <h1 className="text-3xl font-bold mb-6">Hanzi/Kanji Practice</h1>
          <div className="mb-4">
            <input
                type="text"
                placeholder="Enter character"
                className="border p-2 rounded-md"
                onChange={(e) => setCurrentCharacter(e.target.value)}
            />
            <AwesomeButton type="primary" onPress={() => handleStartPractice(currentCharacter)}
                           className="ml-4">
              Start Practice
            </AwesomeButton>
          </div>
          <div className="mb-4 flex items-center gap-4">
            <label className="flex items-center gap-2">
              Mode:
              <select value={mode} onChange={(e) => handleModeChange(e.target.value)}
                      className="border p-2 rounded-md">
                <option value="help">Help</option>
                <option value="plain">Plain</option>
              </select>
            </label>
          </div>
          <div className="w-full flex justify-center">
            <QuizDisplay character={currentCharacter} mode={mode}/>
          </div>
          <div className="mt-6 p-4 border rounded-lg bg-white shadow-md">
            <h2 className="text-2xl font-bold mb-4">Progress for {currentCharacter}</h2>
            <p>Reading Level: {hanziProgress ? hanziProgress.level.reading : 0}</p>
            <p>Meaning Level: {hanziProgress ? hanziProgress.level.meaning : 0}</p>
            <p>Writing Level: {hanziProgress ? hanziProgress.level.writing : 0}</p>
          </div>
          <LearningSidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar}
                           primaryStyling={primaryStyling}
                           setPrimaryStyling={setPrimaryStyling} lang={lang}/>
        </div>
      </React.Fragment>
  );
};

export default SRS;
