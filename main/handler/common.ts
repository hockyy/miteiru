import {dialog, ipcMain, shell} from "electron";
import {getSubtitles} from "../helpers/getSubtitles";
import {MediaAnalyzer} from "../helpers/mediaAnalyzer";
import fs from "node:fs";
import * as fsPromises from 'node:fs/promises';
import {access} from 'node:fs/promises';
import Japanese from "./japanese";
import Chinese from "./chinese";
import Vietnamese from "./vietnamese";
import Store from 'electron-store';
import path, {basename, dirname, extname, join} from 'path';
import {parse as parseSRT} from '@plussub/srt-vtt-parser';
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite"
import {videoConstants} from "../../renderer/utils/constants";
import axios from "axios";

const store = new Store();

// Media tools configuration
interface ToolConfig {
  name: string;
  check_command: string;
  download_link: string;
  executable_name: string;
  internal_path?: string;
}

const MEDIA_TOOLS_CONFIG: ToolConfig[] = [
  {
    name: "yt-dlp",
    check_command: "--version",
    download_link: "https://github.com/hockyy/miteiru/releases/download/assets/yt-dlp.exe",
    executable_name: process.platform === 'win32' ? "yt-dlp.exe" : "yt-dlp"
  },
  {
    name: "ffmpeg", 
    check_command: "-version",
    download_link: "https://ffmpeg.org/download.html",
    executable_name: process.platform === 'win32' ? "ffmpeg.exe" : "ffmpeg"
  },
  {
    name: "ffprobe",
    check_command: "-version", 
    download_link: "https://ffmpeg.org/download.html",
    executable_name: process.platform === 'win32' ? "ffprobe.exe" : "ffprobe"
  }
];

// Media tools check cache
let mediaToolsCache = {
  result: null,
  timestamp: 0,
  CACHE_DURATION: 30000 // 30 seconds
};

// Get the miteiru tools directory
function getMiteiruToolsPath(): string {
  const os = require('os');
  const path = require('path');
  return path.join(os.tmpdir(), 'miteiru_tools');
}

// Check if tool exists locally (system PATH or miteiru tools folder)
async function checkToolPath(tool: ToolConfig): Promise<{ available: boolean; path: string | null; isInternal: boolean }> {
  const { spawn } = require('child_process');
  const fs = require('fs/promises');
  const path = require('path');
  
  // First check if tool is in miteiru tools folder
  const miteiruToolsPath = getMiteiruToolsPath();
  const internalPath = path.join(miteiruToolsPath, tool.executable_name);
  
  try {
    await fs.access(internalPath);
    // Test if the internal tool works
    const internalWorks = await new Promise<boolean>((resolve) => {
      const child = spawn(internalPath, [tool.check_command]);
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
    
    if (internalWorks) {
      return { available: true, path: internalPath, isInternal: true };
    }
  } catch (error) {
    // Internal tool not found, continue to system check
  }
  
  // Check if tool is available in system PATH
  const systemWorks = await new Promise<boolean>((resolve) => {
    const child = spawn(tool.name, [tool.check_command]);
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
  
  if (systemWorks) {
    return { available: true, path: tool.name, isInternal: false };
  }
  
  return { available: false, path: null, isInternal: false };
}

const isArrayEndsWithMatcher = (path, arrayMatcher) => {
  for (const videoFormat of arrayMatcher) {
    if (path.endsWith('.' + videoFormat)) {
      return true
    }
  }
  return false;
}

const isVideo = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedVideoFormats);
}
const isSubtitle = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedSubtitleFormats);
}

export const registerCommonHandlers = (getTokenizer, packageJson, appDataDirectory) => {

  ipcMain.handle('electron-store-get', async (event, key, defaultValue) => {
    return store.get(key, defaultValue);
  });

  ipcMain.handle('electron-store-set', async (event, key, value) => {
    store.set(key, value);
  });

  // Handler for getting available YouTube subtitle languages
  ipcMain.handle('getYoutubeSubtitleLanguages', async (event, videoID) => {
    console.log(`[IPC] getYoutubeSubtitleLanguages called for ${videoID}`);
    try {
      const { spawn } = require('child_process');
      
      // Get the best yt-dlp path
      const os = require('os');
      const path = require('path');
      const fs = require('fs/promises');
      
      const toolsDir = path.join(os.tmpdir(), 'miteiru_tools');
      const executableName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      const internalPath = path.join(toolsDir, executableName);
      
      let ytDlpPath = 'yt-dlp'; // Default to system
      try {
        await fs.access(internalPath);
        ytDlpPath = internalPath;
        console.log(`[IPC] Using internal yt-dlp: ${internalPath}`);
      } catch {
        console.log(`[IPC] Using system yt-dlp`);
      }

      // Use yt-dlp to list available subtitles
      const ytDlpOutput = await new Promise<string>((resolve, reject) => {
        const child = spawn(ytDlpPath, [
          '--list-subs',
          '--write-auto-subs',
          `https://youtube.com/watch?v=${videoID}`
        ]);
        
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
            resolve(stdout + stderr); // Combine both outputs
          } else {
            reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
          }
        });
        
        child.on('error', (err) => {
          reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        });
      });
      
      // Parse available languages from yt-dlp output
      interface SubtitleLanguage {
        code: string;
        name: string;
        isAutoGenerated: boolean;
      }
      
      const languages: SubtitleLanguage[] = [];
      const lines = ytDlpOutput.split('\n');
      let currentSection = null; // Track which section we're in
      
      // Use Intl.DisplayNames for proper language names
      const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Detect section headers
        if (trimmedLine.includes('Available subtitles for')) {
          currentSection = 'manual';
          continue;
        } else if (trimmedLine.includes('Available automatic captions for')) {
          currentSection = 'auto';
          continue;
        }
        
        // Skip header lines and empty lines
        if (trimmedLine.includes('Language') && trimmedLine.includes('Name')) {
          continue;
        }
        
        if (!trimmedLine || trimmedLine.startsWith('[')) {
          // Empty line or new section starting
          if (languages.length > 0 && trimmedLine.startsWith('[')) {
            break; // End of subtitle sections
          }
          continue;
        }
        
        // Extract language codes when we're in a known section
        if (currentSection && trimmedLine) {
          const langMatch = trimmedLine.match(/^([a-z]{2}(-[A-Za-z]+)?)\s+(.+)/);
          if (langMatch) {
            const langCode = langMatch[1];
            const langName = displayNames.of(langCode) || langCode.toUpperCase();

            
            // Filter out auto-translated subtitles (like en-zh, fr-zh, etc.)
            // These are machine-translated from one language to another
            // Keep original languages and auto-generated (which are auto-transcribed, not translated)
            const isAutoTranslated = langCode.includes('-zh') || langCode.includes('-ja') || 
                                    langCode.includes('-ko') || langCode.includes('-ar') ||
                                    langCode.includes('-hi') || langCode.includes('-es') ||
                                    langCode.includes('-fr') || langCode.includes('-de') ||
                                    langCode.includes('-ru') || langCode.includes('-pt') ||
                                    langCode.includes('-it') || langCode.includes('-tr') ||
                                    langCode.includes('-pl') || langCode.includes('-nl');
            
            if (!isAutoTranslated) {
              languages.push({
                code: langCode,
                name: langName,
                isAutoGenerated: currentSection === 'auto'
              });
            }
          }
        }
      }
      
      console.log(`[IPC] Found ${languages.length} available subtitle languages for ${videoID}`);
      return { languages };
    } catch (error) {
      console.error(`[IPC] Error getting YouTube subtitle languages for ${videoID}:`, error);
      return { languages: [], error: error.message };
    }
  });

  // Download YouTube subtitle to temp file and return file path
  ipcMain.handle('downloadYoutubeSubtitle', async (event, videoID, lang) => {
    console.log(`[IPC] downloadYoutubeSubtitle called for ${videoID} (${lang})`);
    try {
      const { spawn } = require('child_process');
      const tempDir = require('os').tmpdir();
      const tempFilePath = require('path').join(tempDir, `miteiru_youtube_${videoID}_${lang}_${Date.now()}.srt`);
      
      // Get the best yt-dlp path
      const os = require('os');
      const path = require('path');
      const fs = require('fs/promises');
      
      const toolsDir = path.join(os.tmpdir(), 'miteiru_tools');
      const executableName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      const internalPath = path.join(toolsDir, executableName);
      
      let ytDlpPath = 'yt-dlp'; // Default to system
      try {
        await fs.access(internalPath);
        ytDlpPath = internalPath;
        console.log(`[IPC] Using internal yt-dlp: ${internalPath}`);
      } catch {
        console.log(`[IPC] Using system yt-dlp`);
      }

      // Use yt-dlp to download subtitle directly to file
      const extractArgs = [
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', lang,
        '--sub-format', 'srt',
        '--skip-download',
        '--output', tempFilePath.replace('.srt', ''), // yt-dlp will add .srt extension
        `https://youtube.com/watch?v=${videoID}`
      ];
      
      console.log(`[IPC] Running yt-dlp with args:`, extractArgs);
      
      const ytDlpOutput = await new Promise<string>((resolve, reject) => {
        const child = spawn(ytDlpPath, extractArgs);
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
            resolve(stdout + stderr);
          } else {
            reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
          }
        });
        
        child.on('error', (err) => {
          reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        });
      });
      
      // Find the actual downloaded file
      const tempDirPath = path.dirname(tempFilePath);
      const files = await fs.readdir(tempDirPath);
      
      const downloadedFile = files.find(file => 
        file.includes(videoID) && 
        file.includes(lang) && 
        file.endsWith('.srt')
      );
      
      if (!downloadedFile) {
        console.log(`[IPC] Available files:`, files.filter(f => f.includes(videoID)));
        throw new Error(`Could not find downloaded subtitle file for ${videoID} (${lang})`);
      }
      
      const actualFilePath = path.join(tempDirPath, downloadedFile);
      console.log(`[IPC] YouTube subtitle downloaded to: ${actualFilePath}`);
      
      return {
        success: true,
        filePath: actualFilePath,
        language: lang
      };
      
    } catch (error) {
      console.error(`[IPC] Error downloading YouTube subtitle for ${videoID} (${lang}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('getYoutubeSubtitle', async (event, videoID, lang) => {
    // Fetching Subtitles (legacy method - returns entries)
    try {
      return await getSubtitles({
        videoID,
        lang
      })
    } catch (error) {
      console.error('Error fetching subtitles:', error);
      return []
    }
  })
  ipcMain.handle('pickDirectory', async () => {
    return await dialog.showOpenDialog({
      properties:
          [
            // 'openFile',
            // 'multiSelections',
            'openDirectory'
          ],
      // filters: [
      //   {name: 'Images', extensions: ['jpg', 'png', 'gif']},
      //   {name: 'Movies', extensions: ['mkv', 'avi', 'mp4']},
      //   {name: 'Custom File Type', extensions: ['as']},
      //   {name: 'All Files', extensions: ['*']}
      // ]
    });
  })
  ipcMain.handle('pickFile', async (event, allowed) => {
    return await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{
        name: 'Allowed Extensions',
        extensions: allowed
      }]
    });
  })

  ipcMain.handle('readFile', async (event, allowed) => {
    const {
      filePaths,
      canceled
    } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{
        name: 'Allowed Extensions',
        extensions: allowed
      }]
    });
    if (filePaths.length > 0 && !canceled) {
      return fs.readFileSync(filePaths[0], 'utf-8');
    }
    return '';
  })

  ipcMain.handle('saveFile', async (event, allowed, saveData: string) => {
    const {
      filePath,
      canceled
    } = await dialog.showSaveDialog({
      properties: ['createDirectory'],
      filters: [{
        name: 'Allowed Extensions',
        extensions: allowed
      }]
    }).then()

    if (filePath && !canceled) {
      fs.writeFile(filePath, saveData, (err) => {
        if (err) throw err;
        console.info('The file has been saved!');
      });
    }
  })


  ipcMain.handle('removeDictCache', () => {
    const japSet = Japanese.getJapaneseSettings(appDataDirectory);
    const chinSet = Chinese.getMandarinSettings(appDataDirectory);
    const canSet = Chinese.getCantoneseSettings(appDataDirectory);
    const vietSet = Vietnamese.getVietnameseSettings(appDataDirectory);
    return `rm -rf "${japSet.dictPath}"; rm -rf "${japSet.charDictPath}"; rm -rf "${canSet.dictPath}"; rm -rf "${chinSet.dictPath}"; rm -rf "${vietSet.dictPath}"`
  })

  ipcMain.handle('getTokenizerMode', async () => {
    return getTokenizer();
  })
  ipcMain.handle('getAppVersion', async () => {
    return packageJson.version;
  });


  ipcMain.handle('check-subtitle-file', async (event, videoFilePath) => {
    const videoFileName = basename(videoFilePath, extname(videoFilePath));
    const videoDirectory = dirname(videoFilePath);
    const subtitleExtensions = [...videoConstants.supportedSubtitleFormats];
    for (const ext of videoConstants.supportedSubtitleFormats) {
      subtitleExtensions.push('en.' + ext);
    }
    const availableSubs = [];
    for (const ext of subtitleExtensions) {
      const subtitleFilePath = join(videoDirectory, videoFileName + '.' + ext);
      try {
        await access(subtitleFilePath);
        availableSubs.push(subtitleFilePath);
      } catch (error) {
        // Subtitle file does not exist, continue to the next extension
      }
    }
    return availableSubs; // No subtitle file found
  });


  ipcMain.handle('fs-readFile', async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      return buffer.toString('base64'); // Send as base64 string
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('fs-writeFile', async (event, filename, data) => {
    try {
      await fsPromises.writeFile(filename, Buffer.from(data, 'base64'));
      return true;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('parse-subtitle', async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      const currentData = await languageEncoding(buffer);
      const text = iconv.decode(buffer, currentData.encoding);

      if (filename.toLowerCase().endsWith('.ass')) {
        return {
          type: 'ass',
          content: text
        };
      } else if (filename.toLowerCase().endsWith('.lrc')) {
        return {
          type: 'lrc',
          content: text
        };
      } else {
        return {
          type: 'srt',
          content: parseSRT(text)
        };
      }
    } catch (error) {
      throw error;
    }
  });

  // Media analysis and embedded content extraction
  ipcMain.handle('analyze-media-file', async (event, filePath) => {
    console.log('[IPC] analyze-media-file called with:', filePath);
    try {
      const result = await MediaAnalyzer.analyzeFile(filePath);
      console.log('[IPC] analyze-media-file result:', result);
      return result;
    } catch (error) {
      console.error('[IPC] Media analysis failed:', error);
      
      // Return error info with fallback result
      const fallbackResult = {
        duration: 0,
        audioTracks: [],
        subtitleTracks: [],
        videoTracks: [],
        error: error.message,
        toolsAvailable: false
      };
      console.log('[IPC] Returning fallback result:', fallbackResult);
      return fallbackResult;
    }
  });

  ipcMain.handle('extract-embedded-subtitle', async (event, inputPath, streamIndex, outputFormat = 'srt') => {
    console.log(`[IPC] extract-embedded-subtitle called: ${inputPath}, stream ${streamIndex}, format ${outputFormat}`);
    try {
      // Check if FFmpeg is available before attempting extraction
      const toolsStatus = await MediaAnalyzer.checkToolsAvailable();
      if (!toolsStatus.ffmpeg) {
        throw new Error('FFmpeg not found. Please install FFmpeg and make sure it\'s in your PATH.');
      }
      
      const result = await MediaAnalyzer.extractSubtitle(inputPath, streamIndex, outputFormat);
      console.log(`[IPC] Subtitle extracted successfully:`, result);
      return result;
    } catch (error) {
      console.error('[IPC] Subtitle extraction failed:', error);
      throw error;
    }
  });

  ipcMain.handle('reencode-video-with-audio-track', async (event, inputPath, audioStreamIndex, convertToX264, totalDuration) => {
    console.log(`[IPC] reencode-video-with-audio-track called:`, { inputPath, audioStreamIndex, convertToX264, totalDuration });
    try {
      const toolsStatus = await MediaAnalyzer.checkToolsAvailable();
      if (!toolsStatus.ffmpeg) {
        throw new Error('FFmpeg not found. Please install FFmpeg and make sure it\'s in your PATH.');
      }
      
      const result = await MediaAnalyzer.reencodeVideoWithAudioTrack(
        inputPath, 
        audioStreamIndex,
        convertToX264,
        totalDuration,
        (progress) => {
          // Send progress updates back to renderer
          console.log(`[IPC] Sending progress to renderer:`, progress);
          event.sender.send('reencode-progress', progress);
        }
      );
      console.log(`[IPC] Video with audio track reencoded:`, result);
      return result;
    } catch (error) {
      console.error('[IPC] Video audio track reencoding failed:', error);
      throw error;
    }
  });

  ipcMain.handle('cleanup-temp-subtitle', async (event, filePath) => {
    try {
      await MediaAnalyzer.cleanupTempFile(filePath);
    } catch (error) {
      console.error('Failed to cleanup temp file:', error);
    }
  });


  ipcMain.handle('find-position-delta-in-folder', async (event, filePath, delta = 1) => {
    if (process.platform === 'win32' && filePath.charAt(0) === '/') {
      filePath = filePath.substring(1);
    }

    const matcher = isVideo(filePath) ? videoConstants.supportedVideoFormats :
        isSubtitle(filePath) ? videoConstants.supportedSubtitleFormats :
            [];

    const folderPath = dirname(filePath);

    try {
      const filesMatched = fs.readdirSync(folderPath)
      .map(fileName => join(folderPath, fileName))
      .filter(filePattern => isArrayEndsWithMatcher(filePattern, matcher))
      .sort();
      filePath = path.normalize(filePath);
      const currentIndex = filesMatched.indexOf(filePath);
      if (currentIndex === -1) {
        if (delta < 0) delta++;
      }

      const nextIndex = currentIndex + delta;
      if (nextIndex >= 0 && nextIndex < filesMatched.length) {
        return filesMatched[nextIndex];
      }

      return '';
    } catch (error) {
      console.error('Error reading directory:', error);
      return '';
    }
  });

  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
  });


  async function translateHandler(text, lang) {
    const targetLang = 'en';
    const url = 'https://translate.googleapis.com/translate_a/single';

    const params = new URLSearchParams({
      client: 'gtx',
      sl: lang,
      tl: targetLang,
      dt: 't',
      q: text
    });

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`Translation request failed with status code: ${response.status}`);
      }

      const data = await response.json();
      return data[0].map(sentence => sentence[0]).join('');
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }

  ipcMain.handle('gtrans', async (event, text, lang) => {
    try {
      const result = await translateHandler(text, lang);
      return {
        success: true,
        translatedText: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

// Handler for creating a GitHub Gist
  ipcMain.handle('createGitHubGist', async (event, filename: string, content: string, description: string, isPublic: boolean, token: string) => {
    try {
      const response = await axios.post('https://api.github.com/gists', {
        files: {
          [filename]: {
            content: content,
          },
        },
        description: description,
        public: isPublic,
      }, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      return {
        success: true,
        gistUrl: response.data.html_url,
        gistId: response.data.id,
      };
    } catch (error) {
      console.error('Error creating GitHub Gist:', error);
      return {
        success: false,
        error: error.response ? error.response.data.message : error.message,
      };
    }
  });

// Handler for loading a user's GitHub Gists
  ipcMain.handle('loadGitHubGists', async (event, username: string, token: string, perPage: number = 30, page: number = 1) => {
    try {
      const response = await axios.get(`https://api.github.com/users/${username}/gists`, {
        params: {
          per_page: perPage,
          page: page,
        },
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token}`,
        },
      });

      const gists = response.data.map(gist => ({
        id: gist.id,
        description: gist.description,
        created_at: gist.created_at,
        updated_at: gist.updated_at,
        files: Object.keys(gist.files).map(filename => ({
          filename: filename,
          language: gist.files[filename].language,
          raw_url: gist.files[filename].raw_url,
        })),
        html_url: gist.html_url,
      }));

      return {
        success: true,
        gists: gists,
      };
    } catch (error) {
      console.error('Error loading GitHub Gists:', error);
      return {
        success: false,
        error: error.response ? error.response.data.message : error.message,
      };
    }
  });

// Handler for getting the content of a specific Gist
  ipcMain.handle('getGitHubGistContent', async (event, gistId: string, token: string) => {
    try {
      const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token}`,
        },
      });

      const gist = {
        id: response.data.id,
        description: response.data.description,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        files: Object.keys(response.data.files).map(filename => ({
          filename: filename,
          language: response.data.files[filename].language,
          content: response.data.files[filename].content,
          raw_url: response.data.files[filename].raw_url,
        })),
        html_url: response.data.html_url,
      };

      return {
        success: true,
        gist: gist,
      };
    } catch (error) {
      console.error('Error getting GitHub Gist content:', error);
      return {
        success: false,
        error: error.response ? error.response.data.message : error.message,
      };
    }
  });

  // Handler to get user data path
  ipcMain.handle('get-user-data-path', () => {
    return appDataDirectory;
  });

  // Handler to join path segments
  ipcMain.handle('join-path', (event, ...pathSegments) => {
    return path.join(...pathSegments);
  });

  // Handler to get directory name from path
  ipcMain.handle('get-dirname', (event, filePath) => {
    return path.dirname(filePath);
  });

  // Handler to get base name from path
  ipcMain.handle('get-basename', (event, filePath) => {
    return path.basename(filePath);
  });

  // Handler to ensure directory exists
  ipcMain.handle('ensure-dir', async (event, dirPath) => {
    try {
      await fsPromises.mkdir(dirPath, {recursive: true});
      return true;
    } catch (error) {
      console.error('Error creating directory:', error);
      return false;
    }
  });

  // Handler to write file
  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      await fsPromises.writeFile(filePath, content, 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing file:', error);
      return false;
    }
  });

  // Handler to open path in file explorer
  ipcMain.handle('open-path', async (event, pathToOpen) => {
    try {
      await shell.openPath(pathToOpen);
      return true;
    } catch (error) {
      console.error('Error opening path:', error);
      return false;
    }
  });

  // Handler to check if file exists
  ipcMain.handle('check-file', async (event, filePath) => {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // Handler to check media tools availability with new configuration system
  ipcMain.handle('checkMediaTools', async (event, forceRefresh = false) => {
    const now = Date.now();
    
    // Check if we have a valid cached result (unless force refresh is requested)
    if (!forceRefresh && mediaToolsCache.result && 
        (now - mediaToolsCache.timestamp) < mediaToolsCache.CACHE_DURATION) {
      console.log('[Media Tools Check] Using cached result');
      return mediaToolsCache.result;
    }
    
    if (forceRefresh) {
      console.log('[Media Tools Check] Force refresh requested');
    }
    
    console.log('[Media Tools Check] Performing fresh check...');
    
    try {
      const toolsStatus = {};
      const missingTools = [];
      const availableTools = [];
      
      // Check each tool using the new configuration system
      for (const tool of MEDIA_TOOLS_CONFIG) {
        const toolCheck = await checkToolPath(tool);
        
        toolsStatus[tool.name] = {
          available: toolCheck.available,
          path: toolCheck.path,
          isInternal: toolCheck.isInternal,
          config: tool
        };
        
        if (toolCheck.available) {
          availableTools.push(`${tool.name}${toolCheck.isInternal ? ' (internal)' : ''}`);
        } else {
          missingTools.push(tool.name);
        }
        
        console.log(`[Media Tools Check] ${tool.name}: ${toolCheck.available ? 'OK' : 'Missing'} ${toolCheck.isInternal ? '(internal)' : '(system)'}`);
      }
      
      const allAvailable = missingTools.length === 0;
      const someAvailable = availableTools.length > 0;
      
      const result = {
        ok: allAvailable ? 1 : someAvailable ? 0 : 0,
        message: allAvailable 
          ? `All optional tools available: ${availableTools.join(', ')}`
          : missingTools.length === MEDIA_TOOLS_CONFIG.length
          ? 'No optional tools found (app will work without them)'
          : `Available: ${availableTools.join(', ')} | Optional: ${missingTools.join(', ')}`,
        details: toolsStatus,
        missingTools,
        availableTools,
        cached: false
      };
      
      // Cache the result
      mediaToolsCache.result = { ...result, cached: true };
      mediaToolsCache.timestamp = now;
      
      console.log('[Media Tools Check] Fresh check completed, result cached');
      return result;
      
    } catch (error) {
      const errorResult = {
        ok: 0,
        message: `Error checking optional tools: ${error.message}`,
        details: {},
        missingTools: MEDIA_TOOLS_CONFIG.map(t => t.name),
        availableTools: [],
        cached: false
      };
      
      // Cache error result too
      mediaToolsCache.result = { ...errorResult, cached: true };
      mediaToolsCache.timestamp = now;
      
      return errorResult;
    }
  });

  // Handler to download a missing tool (legacy - frontend now opens links instead)
  ipcMain.handle('downloadTool', async (event, toolName) => {
    console.log(`[IPC] downloadTool called for ${toolName}`);
    
    const tool = MEDIA_TOOLS_CONFIG.find(t => t.name === toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }
    
    try {
      const axios = require('axios');
      const fs = require('fs/promises');
      const path = require('path');
      
      // Ensure miteiru tools directory exists
      const toolsDir = getMiteiruToolsPath();
      await fs.mkdir(toolsDir, { recursive: true });
      
      const downloadPath = path.join(toolsDir, tool.executable_name);
      
      console.log(`[IPC] Downloading ${tool.name} from ${tool.download_link}`);
      console.log(`[IPC] Download path: ${downloadPath}`);
      
      // Download the tool
      const response = await axios.get(tool.download_link, {
        responseType: 'stream',
        timeout: 60000 // 60 second timeout
      });
      
      const fileStream = require('fs').createWriteStream(downloadPath);
      response.data.pipe(fileStream);
      
      return new Promise((resolve) => {
        fileStream.on('finish', async () => {
          try {
            // Make executable on Unix systems
            if (process.platform !== 'win32') {
              await fs.chmod(downloadPath, 0o755);
            }
            
            console.log(`[IPC] Successfully downloaded ${tool.name} to ${downloadPath}`);
            resolve({ 
              success: true, 
              path: downloadPath,
              message: `${tool.name} downloaded successfully`
            });
          } catch (error) {
            resolve({ 
              success: false, 
              error: `Failed to set permissions: ${error.message}` 
            });
          }
        });
        
        fileStream.on('error', (error) => {
          resolve({ 
            success: false, 
            error: `Download failed: ${error.message}` 
          });
        });
      });
      
    } catch (error) {
      console.error(`[IPC] Error downloading ${tool.name}:`, error);
      return { 
        success: false, 
        error: error.message || 'Download failed' 
      };
    }
  });

  // Handler to get tools configuration
  ipcMain.handle('getToolsConfig', async () => {
    return {
      tools: MEDIA_TOOLS_CONFIG,
      toolsPath: getMiteiruToolsPath()
    };
  });

  // Backward compatibility handler for old FFmpeg check
  ipcMain.handle('checkFFmpegTools', async (event, forceRefresh = false) => {
    console.log('[Backward Compatibility] checkFFmpegTools called, using MediaAnalyzer directly');
    
    try {
      // Check FFmpeg tools using existing MediaAnalyzer
      const ffmpegStatus = await MediaAnalyzer.checkToolsAvailable();
      const isAvailable = ffmpegStatus.ffmpeg && ffmpegStatus.ffprobe;
      
      const result = {
        ok: isAvailable ? 1 : 0,
        message: isAvailable 
          ? 'FFmpeg and FFprobe are available'
          : `Missing tools - FFmpeg: ${ffmpegStatus.ffmpeg ? 'OK' : 'Missing'}, FFprobe: ${ffmpegStatus.ffprobe ? 'OK' : 'Missing'}`,
        details: ffmpegStatus,
        cached: false
      };
      
      return result;
      
    } catch (error) {
      return {
        ok: 0,
        message: `Error checking FFmpeg tools: ${error.message}`,
        details: { ffmpeg: false, ffprobe: false },
        cached: false
      };
    }
  });
}