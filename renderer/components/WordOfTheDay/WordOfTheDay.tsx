import React, { useCallback } from 'react';
import { getColorGradient, getRelativeTime } from '../../utils/utils';
import { videoConstants } from '../../utils/constants';
import { Key } from '../VideoPlayer/KeyboardHelp';

// Reusable component for drag illustration and navigation
const DragIllustration: React.FC = () => (
  
  <div className="flex flex-col gap-4 items-center justify-center text-center p-8 bg-white rounded-xl shadow-lg border-2 border-blue-200">
    <div className="text-6xl text-blue-700 font-mono">Drag a video here 📚</div>
    <p className="text-sm text-gray-500 mt-2">
      Press <Key value="Ctrl + H" extraClass="inline"/> &nbsp;to go back to the home page
    </p>
    <img 
      src="../images/Dragging.gif" 
      alt="Drag video files here" 
      className="opacity-75"
      style={{
        margin: '20px 0',
        maxHeight: '30vh',
        maxWidth: '40vw',
      }}
    />
  </div>
);

interface WordOfTheDayProps {
  dailyWords: Array<{
    word: string;
    level: number;
    updTime: number;
    reading?: string;
    meaning?: string;
  }>;
  dateString: string;
  lang: string;
  setMeaning: (word: string) => void;
  tokenizeMiteiru?: (word: string) => Promise<any>;
  onRefresh?: () => void;
}

const WordOfTheDay: React.FC<WordOfTheDayProps> = ({
  dailyWords,
  dateString,
  lang,
  setMeaning,
  tokenizeMiteiru,
  onRefresh
}) => {
  const handleWordClick = useCallback((word: string) => {
    setMeaning(word);
  }, [setMeaning]);

  const getLevelName = useCallback((level: number) => {
    const levels = ['New', 'Learning', 'Known', 'Mastered'];
    return levels[level] || 'Unknown';
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 relative z-4">
      <div className="flex flex-col items-center justify-center max-w-6xl w-full gap-4">
        <DragIllustration />
        <p className="text-2xl text-gray-800 font-bold">Some learned words to review</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {dailyWords.map((item, index) => (
            <div
              key={`${item.word}-${index}`}
              className="bg-white rounded-xl p-6 shadow-lg border-2 border-gray-200 hover:border-blue-300 transition-all duration-300 cursor-pointer transform hover:scale-105 relative z-[17]"
              style={{
                background: `linear-gradient(135deg, ${getColorGradient(item.updTime)}, white)`
              }}
              onClick={() => handleWordClick(item.word)}
            >
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-800 mb-2 break-words">
                  {item.word}
                </div>
                <div className="text-xs text-gray-500">
                  Time learned: {getRelativeTime(item.updTime)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WordOfTheDay;
