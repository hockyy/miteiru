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
    if (!sentence?.trim()) {
      return [];
    }

    const result: VietnameseTokenResult[] = [];
    let i = 0;
    
    while (i < sentence.length) {
      let matched = false;
      
      // Try to find the longest match starting from current position
      for (const term of this.sortedTerms) {
        if (sentence.slice(i).startsWith(term)) {
          // Found a match
          const meaning = this.dictionary.get(term) || '';
          
          // For Vietnamese, break compound terms by spaces but keep meaning for all parts
          const words = term.split(/(\s+)/); // Keep separators
          const separation = words.filter(word => word.trim().length > 0).map(word => ({
            main: word,
            meaning: ""
          }));
          
          result.push({
            origin: term,
            meaning: meaning,
            separation: separation
          });
          i += term.length;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        const char = sentence[i];
        // Skip standalone spaces completely - they'll be preserved within compound words
        if (char !== ' ') {
          result.push({
            origin: char,
            meaning: '',
            separation: [{ main: char }]
          });
        }
        i += 1;
      }
    }
    
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
