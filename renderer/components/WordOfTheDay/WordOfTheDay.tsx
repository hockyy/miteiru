import React, { useCallback } from 'react';
import { getColorGradient, getRelativeTime } from '../../utils/utils';
import { videoConstants } from '../../utils/constants';

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

  if (dailyWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg border-2 border-blue-200">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Word of the Day - Drag a Video to start learning</h2>
          <p className="text-lg text-gray-600 mb-2">{formatDate(dateString)}</p>
          <p className="text-gray-500">No words available for {lang}</p>
          <p className="text-sm text-gray-400 mt-4">
            Start learning words to see your daily selection!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 relative z-4">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-7xl mb-4">🌟</div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Word of the Day</h1>
          <p className="text-xl text-gray-600 mb-1">{formatDate(dateString)}</p>
          <p className="text-lg text-blue-600 font-medium">{lang.toUpperCase()}</p>
          <p className="text-sm text-gray-500 mt-2">
            Click on any word to learn more • Drag a video to start learning
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 text-sm font-medium relative z-20"
            >
              🔄 Refresh Words
            </button>
          )}
        </div>  

        {/* Words Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {dailyWords.map((item, index) => (
            <div
              key={`${item.word}-${index}`}
              className="bg-white rounded-xl p-6 shadow-lg border-2 border-gray-200 hover:border-blue-300 transition-all duration-300 cursor-pointer transform hover:scale-105 relative z-20"
              style={{
                background: `linear-gradient(135deg, ${getColorGradient(item.updTime)}, white)`
              }}
              onClick={() => handleWordClick(item.word)}
            >
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-800 mb-2 break-words">
                  {item.word}
                </div>
                
                {/* Reading (pronunciation) */}
                {item.reading && (
                  <div className="text-lg text-blue-600 mb-2 break-words">
                    {item.reading}
                  </div>
                )}
                
                {/* Meaning */}
                {item.meaning && (
                  <div className="text-sm text-gray-700 mb-3 break-words line-clamp-2" 
                       title={item.meaning}>
                    {item.meaning}
                  </div>
                )}
                
                <div className="flex flex-col gap-2">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium state${item.level}`}>
                    {getLevelName(item.level)}
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    New Word
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="text-center">
          <div className="bg-white/80 rounded-lg p-4 inline-block">
            <p className="text-sm text-gray-600 mb-1">
              🎯 Your daily challenge: Review these {dailyWords.length} words
            </p>
            <p className="text-xs text-gray-500">
              These words are randomly selected based on today's date from your learning vocabulary
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordOfTheDay;
