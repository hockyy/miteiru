import React, {useCallback, useEffect, useRef, useState} from "react";
import HanziWriter from "hanzi-writer";

import {AwesomeButton} from "react-awesome-button";
import {learningConstants} from "../../utils/constants";

const Review = ({questionData}) => {
  const {
    content,
    cantodict_id,
    dialect,
    stroke_count,
    freq,
    pinyin,
    decomposition,
    meaning,
    radical,
    jyutping,
    etymology,
    variants,
  } = questionData;

  return (
      <div className="w-full border-2 border-red-700 rounded-lg">
        <div className="flex flex-wrap rounded-t-lg bg-red-100 px-1 py-2">
          {cantodict_id && (
              <span className="bg-red-600 text-white rounded-lg px-2 py-1 m-1">
            CantoDict {cantodict_id}
          </span>
          )}
          {dialect && (
              <span className="bg-red-600 text-white rounded-lg px-2 py-1 m-1">
            {dialect} dialect
          </span>
          )}
          {stroke_count && (
              <span className="bg-red-600 text-white rounded-lg px-2 py-1 m-1">
            {stroke_count} strokes
          </span>
          )}
          {freq && (
              <span className="bg-red-600 text-white rounded-lg px-2 py-1 m-1">
            {freq} appearances
          </span>
          )}
        </div>

        <div className="flex flex-col p-4 text-start items-start gap-3">
          <div>
            <span className="text-8xl">{content}</span>
          </div>

          {decomposition && (
              <div className="text-5xl flex flex-row gap-5">
                {decomposition.split('').map((char, index) => (
                    <span key={index}
                          className="bg-white rounded-xl p-2 border-2 border-blue-700">
                  {char}
                </span>
                ))}
              </div>
          )}
          <hr/>
          <div className="text-red-600">
            {meaning.map((m, index) => (
                <p key={index}>
                  <span className="font-bold mr-1">{index + 1}.</span>
                  {m}
                </p>
            ))}
          </div>

          <div className="text-red-600 text-xl">
            {pinyin && (
                <p>
                  <span className="font-bold">Pinyin:</span> {pinyin.join(', ')}
                </p>
            )}
            {jyutping && (
                <p>
                  <span className="font-bold">Jyutping:</span> {jyutping.join(', ')}
                </p>
            )}
            {radical && (
                <p>
                  <span className="font-bold">Radical:</span> {radical}
                </p>
            )}
            {etymology && (
                <p>
                    <span
                        className="font-bold">Etymology:</span> {etymology.type} | {etymology.hint}
                </p>
            )}
            {variants && variants.length > 0 && (
                <p>
                  <span className="font-bold">Variants:</span> {variants.join(', ')}
                </p>
            )}
          </div>

          <hr/>

        </div>
      </div>
  );
};

const QuizContainer = ({children, className = ''}) => {
  return (
      <div
          className={`flex flex-col min-w-[60vw] min-h-[50vh] p-4 gap-4 items-center border-2 border-gray-300 rounded-md bg-white shadow-lg ${className}`}
      >
        {children}
      </div>
  );
};

const MultipleChoiceComponent = ({
                                   questionData,
                                   onAnswer,
                                   QuestionComponent,
                                   OptionComponent
                                 }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [showReview, setShowReview] = useState(false);

  const handleOptionClick = useCallback((optionContent) => {
    setSelectedOption(optionContent);
    setShowReview(true);
  }, []);

  const handleNextQuestion = useCallback(() => {
    const isCorrect = selectedOption === questionData.correct.content;
    onAnswer(isCorrect ? learningConstants.scoreCorrect : learningConstants.scoreWrong);
    setSelectedOption(null);
    setShowReview(false);
  }, [onAnswer, questionData, selectedOption]);

  return (
      <QuizContainer>
        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-2">Question</h2>
          <div className="flex flex-row items-center">
            <div className="flex flex-wrap justify-center">
              <QuestionComponent questionData={questionData.correct}/>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full">
          {questionData.options.map((option, index) => (
              <OptionComponent
                  key={index}
                  option={option}
                  isSelected={selectedOption === option.content}
                  onClick={() => handleOptionClick(option.content)}
                  disabled={showReview}
              />
          ))}
        </div>

        {showReview && (
            <div className="text-center">
              <p className={`text-3xl font-bold ${
                  selectedOption === questionData.correct.content ? 'text-green-600' : 'text-red-600'
              }`}>
                {selectedOption === questionData.correct.content ? 'Correct!' : 'Incorrect'}
              </p>
              <Review questionData={questionData.correct}></Review>
            </div>
        )}

        <button
            className={`py-2 px-4 rounded-md text-lg font-semibold ${
                showReview
                    ? 'bg-gray-600 text-white hover:bg-gray-900'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            onClick={handleNextQuestion}
            disabled={!showReview}
        >
          Next Question
        </button>
      </QuizContainer>
  );
};

const WritingQuizDisplay = ({
                              character,
                              mode = 'plain',
                              onAnswer,
                            }) => {
  const writingRef = useRef(null);
  const [hanziWriter, setHanziWriter] = useState(null);
  const [changer, setChanger] = useState(0);
  const [showReview, setShowReview] = useState(false);
  useEffect(() => {
    if (hanziWriter === null && writingRef.current) {
      try {
        setHanziWriter(HanziWriter.create(writingRef.current, '学', {
          width: 300,
          height: 300,
          padding: 10,
          drawingWidth: 40,
          highlightOnComplete: true,
          outlineColor: '#d7d7d7',
          strokeColor: '#000000' // White color for the strokes
        }))
      } catch (e) {
      }
    }
  }, [hanziWriter]);

  const handleNextQuestion = useCallback(() => {
    onAnswer(learningConstants.scoreCorrect);
  }, [onAnswer]);


  useEffect(() => {
    if (writingRef.current && hanziWriter && character && character.content.length === 1) {
      try {
        hanziWriter.cancelQuiz();
        setShowReview(false);
        hanziWriter.setCharacter(character.content);
        hanziWriter.quiz({
          showHintAfterMisses: mode === 'plain' ? 3 : false,
          onComplete: () => {
            setShowReview(true);
          },
        }).catch(error => {
          console.log(error)
        });
        if (mode === 'help') {
          hanziWriter.showOutline();
        } else {
          hanziWriter.hideOutline();
        }
      } catch (e) {
        console.log(e);
      }
    }
  }, [character, mode, hanziWriter, changer, onAnswer]);

  return (
      <QuizContainer>
        <svg ref={writingRef} xmlns="http://www.w3.org/2000/svg" width="300" height="300">
          <line x1="0" y1="0" x2="300" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="300" y1="0" x2="0" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="150" y1="0" x2="150" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="0" y1="150" x2="300" y2="150" stroke="lightgray" strokeWidth="1"/>
        </svg>

        {character && <QuestionInfo questionData={character}/>}
        <AwesomeButton type={'primary'} onPress={() => {
          setChanger(old => {
            return old + 1;
          })
        }}>Reset</AwesomeButton>
        {showReview && (
            <div className="text-center">
              <p className="text-xl">

              </p>
            </div>
        )}

        <button
            className={`py-2 px-4 rounded-md text-lg font-semibold ${
                showReview
                    ? 'bg-gray-600 text-white hover:bg-gray-900'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            onClick={handleNextQuestion}
            disabled={!showReview}
        >
          Next Question
        </button>
      </QuizContainer>
  );
}
const QuestionInfo = ({questionData}) => {
  const {meaning, pinyin, jyutping, decomposition} = questionData;
  const [shownMeanings, setShownMeanings] = useState(1);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [showDecomposition, setShowDecomposition] = useState(false);

  useEffect(() => {
    setShownMeanings(1);
    setShowPronunciation(false);
    setShowDecomposition(false);
  }, [questionData]);

  const togglePronunciation = useCallback(() => {
    setShowPronunciation(prev => !prev);
  }, []);

  const toggleDecomposition = useCallback(() => {
    setShowDecomposition(prev => !prev);
  }, []);

  const showMoreMeanings = useCallback(() => {
    setShownMeanings(prev => Math.min(prev + 1, meaning.length));
  }, [meaning.length]);

  return (
      <div className="border-2 border-red-700 rounded-lg">
        <div className="w-full flex justify-around p-4 flex-wrap gap-2">
          <AwesomeButton onPress={togglePronunciation}>
            {showPronunciation ? 'Hide Pronunciation' : 'Show Pronunciation'}
          </AwesomeButton>
          {decomposition && (
              <AwesomeButton onPress={toggleDecomposition}>
                {showDecomposition ? 'Hide Decomposition' : 'Show Decomposition'}
              </AwesomeButton>
          )}
          {shownMeanings < meaning.length && (
              <AwesomeButton onPress={showMoreMeanings}>
                Show More ({shownMeanings}/{meaning.length})
              </AwesomeButton>
          )}
        </div>
        <div className="text-xl flex flex-col p-4 text-start items-start gap-3">
          <hr className="w-full border-t border-gray-300"/>

          <div className="text-red-600 w-full">
            <div className={'font-bold'}>Meaning:</div>
            <ul className="list-disc list-inside mt-2">
              {meaning.slice(0, shownMeanings).map((m, index) => (
                  <li key={index} className="mt-1">{m}</li>
              ))}
            </ul>
          </div>

          {showPronunciation && (
              <div className="text-red-600 w-full">
                {pinyin && (
                    <p>
                      <span className="font-bold">Pinyin:</span> {pinyin.join(', ')}
                    </p>
                )}
                {jyutping && (
                    <p>
                      <span className="font-bold">Jyutping:</span> {jyutping.join(', ')}
                    </p>
                )}
              </div>
          )}

          {showDecomposition && decomposition && (
              <div className="w-full">
                <div className="font-bold text-red-600">Decomposition:</div>
                <div className="text-5xl flex flex-row gap-5 mt-2 flex-wrap">
                  {decomposition.split('').map((char, index) => (
                      <span key={index}
                            className="bg-white rounded-xl p-2 border-2 border-blue-700">
                  {char}
                </span>
                  ))}
                </div>
              </div>
          )}

          <hr className="w-full border-t border-gray-300"/>
        </div>
      </div>
  );
};

const ConveyanceQuestion = ({questionData}) => (
    <QuestionInfo questionData={questionData}/>
);

const ReadingQuestion = ({questionData}) => (
    <div className="text-4xl font-bold">{questionData.content}</div>
);

const ConveyanceOption = ({option, isSelected, onClick, disabled}) => (
    <button
        className={`py-2 px-4 rounded-md text-4xl transition-colors ${
            isSelected
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
        }`}
        onClick={onClick}
        disabled={disabled}
    >
      {option.content}
    </button>
);

// Function to format the readings
const formatPinyin = (pinyin) => {
  if (typeof pinyin === 'string') return pinyin;
  return pinyin.map(p => p.replace(/\d/g, '')).join(' / ');
};

const formatJyutping = (jyutping) => {
  if (typeof jyutping === 'string') return jyutping;
  return jyutping.join(' / ');
};

const ReadingOption = ({option, isSelected, onClick, disabled}) => {
  const pinyinReadings = option.pinyin || [];
  const jyutpingReadings = option.jyutping || [];

  return (
      <button
          className={`py-2 px-4 rounded-md text-2xl transition-colors ${
              isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
          onClick={onClick}
          disabled={disabled}
      >
        <div className="flex flex-col items-center font-bold">
          {pinyinReadings.length > 0 && (
              <div className="text-red-700">{formatPinyin(pinyinReadings)}</div>
          )}
          {jyutpingReadings.length > 0 && (
              <div className="text-blue-700">{formatJyutping(jyutpingReadings)}</div>
          )}
        </div>
      </button>
  );
};
const ConveyanceQuizDisplay = ({questionData, onAnswer}) => {
  return (
      <MultipleChoiceComponent
          questionData={questionData}
          onAnswer={onAnswer}
          QuestionComponent={ConveyanceQuestion}
          OptionComponent={ConveyanceOption}
      />
  );
};

const ReadingQuizDisplay = ({questionData, onAnswer}) => {
  return (
      <MultipleChoiceComponent
          questionData={questionData}
          onAnswer={onAnswer}
          QuestionComponent={ReadingQuestion}
          OptionComponent={ReadingOption}
      />
  );
};


export {ConveyanceQuizDisplay};
export {WritingQuizDisplay};
export {ReadingQuizDisplay};

