import React, {useCallback, useEffect, useState} from "react";
import {ipcRenderer} from "electron";
import QuizDisplay from "../components/Meaning/QuizDisplay";
import "react-awesome-button/dist/styles.css";
import Head from "next/head";
import useMeaning from "../hooks/useMeaning";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import MeaningBox from "../components/Meaning/MeaningBox";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import {LearningSidebar} from "../components/VideoPlayer/LearningSidebar";
import {defaultLearningStyling} from "../utils/CJKStyling";
import {useStoreData} from "../hooks/useStoreData";

// Define the types
enum SkillConstant {
  Writing,
  Conveyance,
  Translation,
}

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
  useLearningKeyBind(setMeaning, setShowSidebar, undo);

  const [mode, setMode] = useState("help");
  const [questionData, setQuestionData] = useState<{
    question: string;
    options: string[]
  } | null>(null);
  const [primaryStyling, setPrimaryStyling] = useStoreData(
      "user.styling.learning",
      defaultLearningStyling
  );

  const fetchQuestion = useCallback(async () => {
    const question = await ipcRenderer.invoke("learn-getOneQuestion", lang, SkillConstant.Writing, 0);
    console.log(question)
    setQuestionData(question);
  }, [lang]);

  useEffect(() => {
    fetchQuestion().then(() => console.log("OK"));
  }, [fetchQuestion]);

  const handleAnswer = async (isCorrect: boolean) => {
    if (questionData) {
      await ipcRenderer.invoke(
          "learn-updateOneCharacter",
          SkillConstant.Writing,
          lang,
          questionData.question,
          isCorrect
      );
      fetchQuestion(); // Fetch the next question
    }
  };

  const handleModeChange = useCallback((newMode: string) => {
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
          {questionData && (
              <div className="w-full flex justify-center">
                <QuizDisplay
                    character={questionData.question}
                    onAnswer={handleAnswer}
                    mode={mode}
                />
              </div>
          )}
          <LearningSidebar
              showSidebar={showSidebar}
              setShowSidebar={setShowSidebar}
              primaryStyling={primaryStyling}
              setPrimaryStyling={setPrimaryStyling}
              lang={lang}
          />
        </div>
      </React.Fragment>
  );
};

export default SRS;
