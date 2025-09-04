import { useCallback, useEffect, useState } from 'react';

interface WordOfTheDayItem {
  word: string;
  level: number;
  updTime: number;
}

// Seeded random number generator for consistent daily words
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

const useWordOfTheDay = (lang: string) => {
  const [dailyWords, setDailyWords] = useState<WordOfTheDayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateString, setDateString] = useState('');

  const generateDailyWords = useCallback(async () => {
    if (!lang) return;

    setIsLoading(true);
    
    try {
      // Get current date as seed (YYYY-MM-DD format)
      const today = new Date();
      const currentDate = today.toISOString().split('T')[0];
      setDateString(currentDate);
      
      // Create seed from date string
      const dateNumber = parseInt(currentDate.replace(/-/g, ''), 10);
      const seededRandom = new SeededRandom(dateNumber);
      
      // Load all words for the current language
      const learningState = await window.ipc.invoke('loadLearningState', lang);
      const allWords = Object.entries(learningState);
      
      if (allWords.length === 0) {
        setDailyWords([]);
        setIsLoading(false);
        return;
      }

      // Shuffle array using seeded random
      const shuffled = [...allWords];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom.next() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Take first 8 words (or all if less than 8)
      const selectedWords = shuffled.slice(0, Math.min(8, shuffled.length));
      
      // Transform to WordOfTheDayItem format
      const dailyWordsFormatted: WordOfTheDayItem[] = selectedWords.map(([word, data]: [string, any]) => ({
        word,
        level: data.level || 0,
        updTime: data.updTime || Date.now()
      }));

      setDailyWords(dailyWordsFormatted);
    } catch (error) {
      console.error('Error generating daily words:', error);
      setDailyWords([]);
    } finally {
      setIsLoading(false);
    }
  }, [lang]);

  // Generate words when language changes or on mount
  useEffect(() => {
    generateDailyWords();
  }, [generateDailyWords]);

  // Check if we need to refresh for new day
  const checkForNewDay = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    if (today !== dateString) {
      generateDailyWords();
    }
  }, [dateString, generateDailyWords]);


  return {
    dailyWords,
    isLoading,
    dateString,
    generateDailyWords,
    checkForNewDay
  };
};

export default useWordOfTheDay;
