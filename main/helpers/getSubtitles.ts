import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {videoConstants} from "../../renderer/utils/constants";

interface SubtitleEntry {
  start: string;
  dur: string;
  text: string;
}

// Cache to prevent duplicate requests for the same video
const activeRequests = new Map<string, Promise<SubtitleEntry[]>>();

// Get the best available yt-dlp path (internal or system)
async function getYtDlpPath(): Promise<string> {
  const os = require('os');
  const path = require('path');
  const fs = require('fs/promises');
  
  // Check internal path first
  const toolsDir = path.join(os.tmpdir(), 'miteiru_tools');
  const executableName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const internalPath = path.join(toolsDir, executableName);
  
  try {
    await fs.access(internalPath);
    console.log(`[getSubtitles] Using internal yt-dlp: ${internalPath}`);
    return internalPath;
  } catch {
    console.log(`[getSubtitles] Using system yt-dlp`);
    return 'yt-dlp'; // Fall back to system PATH
  }
}

// Check if yt-dlp is available
async function checkYtDlpAvailable(): Promise<boolean> {
  const ytDlpPath = await getYtDlpPath();
  return new Promise((resolve) => {
    const child = spawn(ytDlpPath, ['--version']);
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

// Parse SRT subtitle content to SubtitleEntry array
function parseSrtContent(srtContent: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  const blocks = srtContent.split(/\n\s*\n/).filter(block => block.trim());
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue; // Skip malformed blocks
    
    // Line 0: Subtitle number (skip)
    // Line 1: Timestamp (e.g., "00:00:01,234 --> 00:00:05,678")
    // Line 2+: Text content
    
    const timestampLine = lines[1];
    const timestampMatch = timestampLine.match(/^(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    
    if (timestampMatch) {
      const startTime = timestampMatch[1].replace(',', '.'); // Normalize to dot format
      const endTime = timestampMatch[2].replace(',', '.'); // Normalize to dot format
      
      // Convert timestamp to seconds
      const start = timeToSeconds(startTime);
      const end = timeToSeconds(endTime);
      const dur = (end - start).toFixed(3);
      
      // Combine all text lines (from line 2 onwards)
      const textLines = lines.slice(2).filter(line => line.trim());
      if (textLines.length > 0) {
        // Remove HTML tags and clean text
        const cleanText = textLines
          .map(line => line.replace(/<[^>]*>/g, '').trim())
          .filter(line => line)
          .join(' ');
          
        if (cleanText) {
          entries.push({
            start: start.toFixed(3),
            dur,
            text: cleanText
          });
        }
      }
    }
  }
  
  return entries;
}

// Convert timestamp string to seconds
function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

// Parse available languages from yt-dlp output
function parseAvailableLanguages(ytDlpOutput: string): string[] {
  const languages = new Set<string>();
  const lines = ytDlpOutput.split('\n');
  
  // Look for lines that contain language codes after "Available automatic captions" or "Available subtitles"
  let inLanguageSection = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if we're entering a language section
    if (trimmedLine.includes('Available automatic captions') || 
        trimmedLine.includes('Available subtitles') || 
        trimmedLine.includes('Language') && trimmedLine.includes('Name')) {
      inLanguageSection = true;
      continue;
    }
    
    // Stop if we hit another section or empty lines after languages
    if (inLanguageSection && (trimmedLine.startsWith('[') || !trimmedLine)) {
      if (languages.size > 0) break; // Only break if we've found languages
      continue;
    }
    
    // Extract language codes from language section
    if (inLanguageSection && trimmedLine) {
      // Language codes are typically at the start of the line, before whitespace
      const langMatch = trimmedLine.match(/^([a-z]{2}(-[A-Za-z]+)?)/);
      if (langMatch) {
        languages.add(langMatch[1]);
      }
    }
  }
  
  return Array.from(languages);
}

// Find the best matching language from available options
function findBestLanguageMatch(requestedLang: string, availableLanguages: string[]): string | null {
  // Direct exact match
  if (availableLanguages.includes(requestedLang)) {
    return requestedLang;
  }
  
  // Language fallback mappings
  const languageFallbacks: { [key: string]: string[] } = {
    'en': ['en-US', 'en-GB', 'en-CA', 'en-AU'],
    'zh-CN': ['zh-CN', 'zh-Hans', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK'],
    'zh-TW': ['zh-TW', 'zh-Hant', 'zh-HK', 'zh-CN', 'zh-Hans', 'zh'],
    'zh': ['zh', 'zh-CN', 'zh-Hans', 'zh-TW', 'zh-Hant', 'zh-HK'],
    'ja': ['ja', 'ja-JP'],
    'ko': ['ko', 'ko-KR'],
    'es': ['es', 'es-ES', 'es-MX', 'es-AR'],
    'fr': ['fr', 'fr-FR', 'fr-CA'],
    'de': ['de', 'de-DE', 'de-AT', 'de-CH']
  };
  
  // Try fallback options for requested language
  const fallbacks = languageFallbacks[requestedLang] || [requestedLang];
  for (const fallback of fallbacks) {
    if (availableLanguages.includes(fallback)) {
      return fallback;
    }
  }
  
  // Try partial matches (e.g., 'en' matches 'en-US')
  const baseRequestedLang = requestedLang.split('-')[0];
  const partialMatch = availableLanguages.find(lang => 
    lang.startsWith(baseRequestedLang + '-') || lang === baseRequestedLang
  );
  if (partialMatch) {
    return partialMatch;
  }
  
  // For Chinese languages, be more flexible
  if (requestedLang.startsWith('zh')) {
    const chineseMatch = availableLanguages.find(lang => lang.startsWith('zh'));
    if (chineseMatch) {
      return chineseMatch;
    }
  }
  
  return null;
}

// Execute yt-dlp command and return result
async function runYtDlp(args: string[]): Promise<string> {
  const ytDlpPath = await getYtDlpPath();
  
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args);
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout + stderr); // Combine both for complete output
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

export async function getSubtitles({
                                     videoID,
                                     lang = videoConstants.japaneseLang
                                   }): Promise<SubtitleEntry[]> {
  const requestKey = `${videoID}_${lang}`;
  
  // Check if there's already an active request for this video+language
  if (activeRequests.has(requestKey)) {
    console.log(`[getSubtitles] Reusing active request for ${videoID} (${lang})`);
    return activeRequests.get(requestKey)!;
  }
  
  // Create the request promise
  const requestPromise = (async (): Promise<SubtitleEntry[]> => {
    // Check if yt-dlp is available
    const ytDlpAvailable = await checkYtDlpAvailable();
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp is not available. Please install yt-dlp to extract YouTube subtitles.');
    }

    const videoUrl = `https://youtube.com/watch?v=${videoID}`;
    console.log(`[getSubtitles] Extracting ${lang} subtitles for ${videoID}`);
    
    // Create temporary directory for subtitle files
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'miteiru_subs_'));
    const outputTemplate = path.join(tempDir, 'subtitle');
    
    try {
      // First, get complete list of available subtitles
      console.log(`[getSubtitles] Getting available subtitles for ${videoID}...`);
      const listArgs = [
        '--list-subs',
        '--write-auto-subs',
        videoUrl
      ];
      
      const subsInfo = await runYtDlp(listArgs);
      console.log(`[getSubtitles] Available subtitles retrieved`);
      
      // Parse available languages from yt-dlp output
      const availableLanguages = parseAvailableLanguages(subsInfo);
      console.log(`[getSubtitles] Available languages:`, availableLanguages);
      
      // Find the best matching language
      const bestMatchLang = findBestLanguageMatch(lang, availableLanguages);
      if (!bestMatchLang) {
        throw new Error(`No suitable ${lang} subtitles found for video ${videoID}. Available languages: ${availableLanguages.join(', ')}`);
      }
      
      console.log(`[getSubtitles] Using language: ${bestMatchLang} (requested: ${lang})`);
      
      // Extract subtitles using the best matching language
      const extractArgs = [
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', bestMatchLang,
        '--sub-format', 'srt',  // Use SRT format instead of VTT
        '--skip-download',
        '--output', outputTemplate,
        videoUrl
      ];
      
      await runYtDlp(extractArgs);
      
      // Find the downloaded subtitle file (more flexible matching)
      const files = await fs.readdir(tempDir);
      const subtitleFile = files.find(file => 
        file.endsWith('.srt') && (
          file.includes(bestMatchLang) || 
          file.includes(lang) ||
          file.includes(lang.split('-')[0]) // Try base language code
        )
      );
      
      if (!subtitleFile) {
        console.log(`[getSubtitles] Downloaded files:`, files);
        throw new Error(`Could not find downloaded ${bestMatchLang} subtitle file for video ${videoID}. Downloaded files: ${files.join(', ')}`);
      }
      
      // Read and parse the subtitle file
      const subtitlePath = path.join(tempDir, subtitleFile);
      const srtContent = await fs.readFile(subtitlePath, 'utf-8');
      console.log(`[getSubtitles] Successfully extracted ${bestMatchLang} subtitles (requested: ${lang})`);
      
      const entries = parseSrtContent(srtContent);
      
      // Cleanup temporary files
      await fs.rm(tempDir, { recursive: true, force: true });
      
      if (entries.length === 0) {
        throw new Error(`No subtitle entries found in ${bestMatchLang} subtitles for video ${videoID}`);
      }
      
      console.log(`[getSubtitles] Parsed ${entries.length} subtitle entries for ${bestMatchLang}`);
      return entries;
      
    } catch (error) {
      // Cleanup on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('[getSubtitles] Failed to cleanup temp directory:', cleanupError);
      }
      throw error;
    }
  })();
  
  // Store the promise to prevent duplicate requests
  activeRequests.set(requestKey, requestPromise);
  
  try {
    const result = await requestPromise;
    return result;
  } catch (error) {
    console.error('[getSubtitles] Error fetching subtitles:', error);
    throw error;
  } finally {
    // Clean up the request cache after completion (success or failure)
    activeRequests.delete(requestKey);
  }
}