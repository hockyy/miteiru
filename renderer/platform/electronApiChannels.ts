/**
 * Every window.electronAPI method of main/preload.ts and the IPC channel it invokes. The Tauri bridge
 * builds window.electronAPI from this table, so a method added to the preload needs one line here
 * (tests/tauriBridgeChannels.test.ts fails when the two drift apart).
 */
export const ELECTRON_API_INVOKE_CHANNELS = {
  googleTranslate: 'gtrans',
  openExternal: 'open-external',
  checkSubtitleFile: 'check-subtitle-file',
  pickMediaFiles: 'pick-media-files',
  parseSubtitle: 'parse-subtitle',
  preprocessSubtitleCapitalization: 'preprocess-subtitle-capitalization',
  findPositionDeltaInFolder: 'find-position-delta-in-folder',
  analyzeMediaFile: 'analyze-media-file',
  extractEmbeddedSubtitle: 'extract-embedded-subtitle',
  reencodeVideoWithAudioTrack: 'reencode-video-with-audio-track',
  cleanupTempSubtitle: 'cleanup-temp-subtitle',
  getUserDataPath: 'get-user-data-path',
  joinPath: 'join-path',
  getDirname: 'get-dirname',
  getBasename: 'get-basename',
  ensureDir: 'ensure-dir',
  writeFile: 'write-file',
  openPath: 'open-path',
  showItemInFolder: 'show-item-in-folder',
  revealAnkiImport: 'reveal-anki-import',
  checkFile: 'check-file',
  getYoutubeVideoTitle: 'getYoutubeVideoTitle',
  createGitHubGist: 'createGitHubGist',
  loadGitHubGists: 'loadGitHubGists',
  getGitHubGistContent: 'getGitHubGistContent'
} as const;

export const LIVE_CAPTIONS_INVOKE_CHANNELS = {
  isSupported: 'live-captions:is-supported',
  getState: 'live-captions:get-state',
  start: 'live-captions:start',
  stop: 'live-captions:stop'
} as const;

export const LIVE_CAPTIONS_EVENT_CHANNELS = {
  onCaption: 'live-captions:caption',
  onState: 'live-captions:state',
  onError: 'live-captions:error',
  onDebug: 'live-captions:debug'
} as const;

export const STORE_CHANNELS = {get: 'electron-store-get', set: 'electron-store-set'} as const;
