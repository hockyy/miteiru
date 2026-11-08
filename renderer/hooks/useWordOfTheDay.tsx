import { useCallback, useEffect, useState } from 'react';
import type { LearningStateType } from '../components/types';

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

/**
 * Eight saved words picked for the day (the same all day), from the saved words the page has
 * already loaded (useLearningState's savedWords). Loading them all again here made opening a video
 * load every saved word twice, for a card that only shows while no video is open.
 */
const useWordOfTheDay = (lang: string, savedWords: Record<string, LearningStateType> | null) => {
  const [dailyWords, setDailyWords] = useState<WordOfTheDayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateString, setDateString] = useState('');

  const generateDailyWords = useCallback(() => {
    if (!lang || !savedWords) {
      setIsLoading(true);
      return;
    }

    try {
      // Get current date as seed (YYYY-MM-DD format)
      const today = new Date();
      const currentDate = today.toISOString().split('T')[0];
      setDateString(currentDate);
      
      // Create seed from date string
      const dateNumber = parseInt(currentDate.replace(/-/g, ''), 10);
      const seededRandom = new SeededRandom(dateNumber);
      
      const allWords = Object.entries(savedWords);
      if (allWords.length === 0) {
        setDailyWords([]);
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
      const dailyWordsFormatted: WordOfTheDayItem[] = selectedWords.map(([word, data]) => ({
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
  }, [lang, savedWords]);

  // Generate words once the saved words are loaded, and again for another language
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
