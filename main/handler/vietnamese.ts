/**
 * Vietnamese Language Handler for Miteiru
 * 
 * Implements Vietnamese tokenization using longest-match suffix algorithm
 * with dictionary lookup from VNEDict (54,375+ entries).
 * 
 * Documentation:
 * - Language Implementation Guide: docs/LANGUAGE_IMPLEMENTATION.md
 * - Vietnamese Implementation Details: docs/VIETNAMESE_IMPLEMENTATION.md
 * - Token Structure Reference: docs/TOKEN_STRUCTURES.md
 * - Language Support Overview: README_LANGUAGES.md
 */

import {ipcMain} from "electron";
import path from "path";
import fs from "node:fs";

interface VietnameseDictionaryEntry {
  term: string;
  meaning: string;
}

interface VietnameseTokenResult {
  origin: string;
  meaning: string;
  separation: { main: string; meaning?: string }[];
}

class Vietnamese {
  static dictionary: Map<string, string> = new Map();
  static sortedTerms: string[] = [];
  static dictPath: string;
  static isLoaded = false;

  static getVietnameseSettings = (appDataDirectory: string, replacements: any = {}) => {
    return {
      dictPath: path.join(__dirname, 'vietnamese/vnedict.txt'),
      ...replacements
    }
  }

  static async setup(settings: any) {
    try {
      this.dictPath = settings.dictPath;
      await this.loadDictionary();
      this.isLoaded = true;
      return null; // No error
    } catch (e) {
      console.error('Vietnamese setup error:', e);
      return e.message;
    }
  }

  static async loadDictionary() {
    try {
      const data = fs.readFileSync(this.dictPath, 'utf-8');
      const lines = data.split('\n');
      
      this.dictionary.clear();
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes(' : ')) {
          const [vietnamese, english] = trimmedLine.split(' : ', 2);
          if (vietnamese && english) {
            this.dictionary.set(vietnamese.trim(), english.trim());
          }
        }
      }
      
      // Sort terms by length in descending order for longest match first
      this.sortedTerms = Array.from(this.dictionary.keys()).sort((a, b) => b.length - a.length);
    } catch (e) {
      console.error('Error loading Vietnamese dictionary:', e);
      throw e;
    }
  }

  /**
   * Tokenize Vietnamese sentence using longest match algorithm from suffix.
   * This implements the longest-match suffix parsing as requested.
   */
  static tokenizeLongestSuffix(sentence: string): VietnameseTokenResult[] {
    console.log(sentence)
    if (!sentence?.trim()) {
      return [];
    }

    const result: VietnameseTokenResult[] = [];
    const splittedSentence = sentence.split(' ');
    for(let i = splittedSentence.length - 1; i >= 0; i--) {
      const rightPointer = i;
      let matched = false;
      for(let j = 0; j <= rightPointer; j++) {
        const current = splittedSentence.slice(j, rightPointer + 1).join(' ');
        if(this.dictionary.has(current.trim())) {
          result.push({
            origin: current,
            meaning: this.dictionary.get(current) || '',
            separation: splittedSentence.slice(j, rightPointer + 1).map(term => ({ main: term }))
          });
          matched = true;
          i = j;
          break;
        }
      }
      if(!matched) {
        result.push({
          origin: splittedSentence[i],
          meaning: '',
          separation: [{ main: splittedSentence[i] }]
        });
      }
    }
    console.log(result);
    return result;
  }

  static registerVietnamese() {
    ipcMain.handle('tokenizeUsingVietnamese', async (event, sentence: string) => {
      if (!this.isLoaded) {
        throw new Error('Vietnamese dictionary not loaded');
      }
      
      return this.tokenizeLongestSuffix(sentence);
    });
  }

  static registerHandlers() {
    ipcMain.handle('queryVietnamese', async (event, query: string, limit: number = 50) => {
      if (!this.isLoaded) {
        return [];
      }

      try {
        // Only return exact matches for Vietnamese
        if (this.dictionary.has(query)) {
          return [{
            content: query,
            meaning: this.dictionary.get(query) || ''
          }];
        }
        
        return [];
        
      } catch (e) {
        console.error('Vietnamese query error:', e);
        return [];
      }
    });
  }
}

export default Vietnamese;
