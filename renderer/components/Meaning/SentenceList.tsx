import React from "react";

interface SentenceListProps {
  sentences: string[];
  onSentenceClick: (sentence: string) => void;
  /** The sentence shown for study now, marked in the list. */
  selected?: string;
}

/** The lines of the Study text, one button each, so they can be picked with a click or the keyboard. */
export const SentenceList: React.FC<SentenceListProps> = ({sentences, onSentenceClick, selected}) => {
  return (
      <ul className="w-full list-none p-0">
        {sentences.map((sentence, index) => {
          const isSelected = sentence === selected;
          return (
              <li key={index} className="border-b border-gray-200">
                <button
                    type="button"
                    aria-pressed={isSelected}
                    className={`w-full cursor-pointer p-2 text-left text-black hover:bg-gray-100 ${isSelected ? "bg-blue-100 font-semibold" : ""}`}
                    onClick={() => onSentenceClick(sentence)}
                >
                  {sentence}
                </button>
              </li>
          );
        })}
      </ul>
  );
};
