import React from "react";

interface SentenceListProps {
  sentences: string[];
  onSentenceClick: (sentence: string) => void;
}

export const SentenceList: React.FC<SentenceListProps> = ({sentences, onSentenceClick}) => {
  return (
      <div className="mt-4 w-full">
        <h3 className="text-black font-semibold mb-2">Extracted Sentences</h3>
        <ul className="list-none p-0">
          {sentences.map((sentence, index) => (
              <li
                  key={index}
                  className="cursor-pointer p-2 hover:bg-gray-100 border-b border-gray-200 text-black"
                  onClick={() => onSentenceClick(sentence)}
              >
                {sentence}
              </li>
          ))}
        </ul>
      </div>
  );
};
