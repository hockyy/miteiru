import React, {useCallback, useEffect, useState} from "react";
import "react-awesome-button/dist/styles.css";
import Head from "next/head";
import useMeaning from "../hooks/useMeaning";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import MeaningBox from "../components/Meaning/MeaningBox";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import {LearningSidebar} from "../components/VideoPlayer/LearningSidebar";
import {defaultLearningStyling} from "../utils/CJKStyling";
import {useStoreData} from "../hooks/useStoreData";
import {AwesomeButton} from "react-awesome-button";
import {
  ConveyanceQuizDisplay,
  ReadingQuizDisplay,
  WritingQuizDisplay
} from "../components/Meaning/QuizDisplay";
import {learningConstants} from "../utils/constants";

// Define the types
enum SkillConstant {
  Writing,
  Conveyance,
  Reading,
  Translation,
}

const usedQuestion = 3;

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
  const [mode,] = useState("plain");
  const [questionCounter, setQuestionCounter] = useState(0);
  const [questionData, setQuestionData] = useState<{
    question: any;
    correct: any;
    options: any[];
    mode: number;
    skillType: number;
  } | null>(null);
  const [primaryStyling, setPrimaryStyling] = useStoreData(
      "user.styling.learning",
      defaultLearningStyling
  );

  const fetchQuestion = useCallback(async (kind:number) => {
    const question = await window.ipc.invoke("learn-getOneQuestion", lang, kind);
    setQuestionData(question);
  }, [lang]);

  useEffect(() => {
    if (questionCounter == 0) {
      fetchQuestion(questionCounter % usedQuestion).then(r => {
        console.log(r)
      });
    }
  }, [fetchQuestion, questionCounter]);

  const handleAnswer = useCallback(async (score: number) => {
    await window.ipc.invoke(
        "learn-updateOneCharacter",
        questionData.skillType,
        lang,
        questionData.correct ? questionData.correct.content : '',
        score
    );
    await fetchQuestion((questionCounter + 1) % usedQuestion); // Fetch the next question
    setQuestionCounter(questionCounter + 1);
  }, [fetchQuestion, lang, questionCounter, questionData]);
  const nextQuestionHandler = useCallback(() => {
    handleAnswer(learningConstants.scoreWrong);
  }, [handleAnswer])

  // const handleModeChange = useCallback((newMode: string) => {
  //   setMode(newMode);
  // }, []);

  return (
      <React.Fragment>
        <Head>
          <title>SRS - Question {questionCounter}</title>
        </Head>
        <div
            className="flex flex-col items-center justify-center bg-blue-50 text-black min-h-screen p-6 gap-3">
          <MeaningBox lang={lang} meaning={meaning} setMeaning={setMeaning}
                      tokenizeMiteiru={tokenizeMiteiru}/>
          <h1 className="text-3xl font-bold mb-6">SRS - Question {questionCounter} - {questionData ? SkillConstant[questionData.skillType] : ''}</h1>
          {questionData && questionData.skillType === 0 && (
              <div className="w-full flex justify-center">
                <WritingQuizDisplay
                    character={questionData.correct}
                    onAnswer={handleAnswer}
                    mode={mode}
                />
              </div>
          )}
          {questionData && questionData.skillType === 1 && (
              <div className="w-full flex justify-center">
                <ConveyanceQuizDisplay
                    questionData={questionData}
                    onAnswer={handleAnswer}
                />
              </div>
          )}
          {questionData && questionData.skillType === 2 && (
              <div className="w-full flex justify-center">
                <ReadingQuizDisplay
                    questionData={questionData}
                    onAnswer={handleAnswer}
                />
              </div>
          )}
          <AwesomeButton type={'primary'} onPress={nextQuestionHandler}>Skip
            Question</AwesomeButton>
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
