export const MECAB_PATH_STORE_KEY = 'app.mecabPath';

const mecabDefaultDirectory: Record<string, string> = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': String.raw`C:\Program Files (x86)\MeCab\bin\mecab.exe`
};

// The renderer has no real `process.platform`; the preload exposes it instead.
const currentPlatform = (): string | undefined =>
  (typeof window !== 'undefined' ? window.electronAPI?.platform : undefined);

export const defaultMecabPath = (): string =>
  mecabDefaultDirectory[currentPlatform()] ?? mecabDefaultDirectory['linux'];
