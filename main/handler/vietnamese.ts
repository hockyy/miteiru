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
import {glossAll, pickVietnameseGloss} from "./languages/learningGlosses";
import path from "path";
import fs from "node:fs";

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
   * Exact dictionary key for a term, falling back to a lowercase first letter
   * (sentence-initial "Nước Nga" → "nước Nga") and then to all lowercase.
   */
  static findDictionaryKey(term: string): string | null {
    const candidates = [term, term.charAt(0).toLowerCase() + term.slice(1), term.toLowerCase()];
    return candidates.find((candidate) => this.dictionary.has(candidate)) ?? null;
  }

  /**
   * Tokenize Vietnamese sentence using longest match algorithm from suffix.
   * Punctuation around a syllable is ignored for matching ("Nga," matches "Nga") but kept
   * in `separation` for display; a multi-syllable match never spans punctuation.
   * `origin` is the matched dictionary key, so lookups and learning state use it directly.
   */
  static tokenizeLongestSuffix(sentence: string): VietnameseTokenResult[] {
    if (!sentence?.trim()) {
      return [];
    }

    const chunks = sentence.split(/\s+/).filter(Boolean).map((raw) => {
      const [, lead, core, trail] = raw.match(/^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/u);
      return {raw, lead, core, trail};
    });
    const canSpan = (j: number, i: number) => chunks.slice(j, i + 1).every((chunk, offset) => (
      chunk.core !== ''
      && (offset === 0 || chunk.lead === '')
      && (j + offset === i || chunk.trail === '')
    ));

    const result: VietnameseTokenResult[] = [];
    for (let i = chunks.length - 1; i >= 0; i--) {
      let matched = false;
      for (let j = 0; j <= i; j++) {
        if (!canSpan(j, i)) continue;
        const key = this.findDictionaryKey(chunks.slice(j, i + 1).map((chunk) => chunk.core).join(' '));
        if (key) {
          result.push({
            origin: key,
            meaning: this.dictionary.get(key) || '',
            separation: chunks.slice(j, i + 1).map((chunk) => ({main: chunk.raw}))
          });
          matched = true;
          i = j;
          break;
        }
      }
      if (!matched) {
        result.push({
          origin: chunks[i].core || chunks[i].raw,
          meaning: '',
          separation: [{main: chunks[i].raw}]
        });
      }
    }
    result.reverse();
    return result;
  }

  static registerHandlers() {
    ipcMain.handle('queryVietnamese', async (event, query: string) => {
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

    // Short glosses for every word of a learning-mode subtitle chunk, in request order.
    ipcMain.handle('learningGlossesVietnamese', async (_event, requests) => {
      if (!this.isLoaded) return [];
      return glossAll(requests, ({target}) => pickVietnameseGloss(this.dictionary.get(target) ?? ''));
    });
  }
}

export default Vietnamese;
