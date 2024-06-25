import React, {useEffect, useRef, useState} from "react";
import HanziWriter from "hanzi-writer";

const QuizDisplay = ({character, mode = 'plain'}) => {
  const writingRef = useRef(null);
  const [hanziWriter, setHanziWriter] = useState(null);
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
    if (writingRef.current && hanziWriter && character.length === 1) {
      try {
        hanziWriter.cancelQuiz();
        hanziWriter.setCharacter(character);
        hanziWriter.quiz({
          showHintAfterMisses: mode === 'plain' ? 3 : false,
          onComplete: () => console.log('Quiz complete'),
        }).then(r => console.log(r)).catch(error => {
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
  }, [character, mode, hanziWriter]);

  return (
      <div
          className="flex flex-col w-[350px] h-[350px] p-4 gap-4 justify-center items-center border-2 border-gray-300 rounded-md">
        <svg ref={writingRef} xmlns="http://www.w3.org/2000/svg" width="300" height="300">
          <line x1="0" y1="0" x2="300" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="300" y1="0" x2="0" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="150" y1="0" x2="150" y2="300" stroke="lightgray" strokeWidth="1"/>
          <line x1="0" y1="150" x2="300" y2="150" stroke="lightgray" strokeWidth="1"/>
        </svg>
      </div>
  );
}

export default QuizDisplay;
