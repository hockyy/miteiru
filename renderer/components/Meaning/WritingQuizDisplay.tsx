import React, {useEffect, useRef, useState} from "react";
import HanziWriter from "hanzi-writer";

import {AwesomeButton} from "react-awesome-button";

const WritingQuizDisplay = ({
                              character,
                              mode = 'plain',
                              onAnswer
                            }) => {
  const writingRef = useRef(null);
  const [hanziWriter, setHanziWriter] = useState(null);
  const [changer, setChanger] = useState(0);
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
  useEffect(() => {
    if (writingRef.current && hanziWriter && character && character.content.length === 1) {
      try {
        hanziWriter.cancelQuiz();
        hanziWriter.setCharacter(character.content);
        hanziWriter.quiz({
          showHintAfterMisses: mode === 'plain' ? 3 : false,
          onComplete: () => {
            onAnswer(true);
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
      <div
          className="flex flex-col w-[350px] h-[430px] p-4 gap-4 justify-center items-center border-2 border-gray-300 rounded-md">
        <svg ref={writingRef} xmlns="http://www.w3.org/2000/svg" width="300" height="300">
          <line x1="0" y1="0" x2="300" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="300" y1="0" x2="0" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="150" y1="0" x2="150" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="0" y1="150" x2="300" y2="150" stroke="lightgray" strokeWidth="1"/>
        </svg>

        <AwesomeButton type={'primary'} onPress={() => {
          setChanger(old => {
            return old + 1;
          })
        }}>Reset</AwesomeButton>

      </div>
  );
}
const MultipleChoiceQuizDisplay = ({questionData, onAnswer}) => {
  const handleOptionClick = (optionContent) => {
    const isCorrect = optionContent === questionData.question.correct.content;
    onAnswer(isCorrect);
  };

  return (
      <div
          className="flex flex-col w-[350px] h-[430px] p-4 gap-4 justify-center items-center border-2 border-gray-300 rounded-md">
        <h2 className="text-2xl font-bold mb-4">Identify the correct character</h2>
        <div className="flex flex-col gap-2 w-full">
          {questionData.options.map((option, index) => (
              <AwesomeButton key={index} type="primary"
                             onPress={() => handleOptionClick(option.content)}>
                {option.content}
              </AwesomeButton>
          ))}
        </div>
      </div>
  );
};

export {MultipleChoiceQuizDisplay};

export {WritingQuizDisplay};

