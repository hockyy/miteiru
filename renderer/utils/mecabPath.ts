export const MECAB_PATH_STORE_KEY = 'app.mecabPath';

const mecabDefaultDirectory = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': 'C:\Program Files (x86)\MeCab\bin\mecab.exe'
};

export const defaultMecabPath = (): string =>
  mecabDefaultDirectory[process.platform] ?? mecabDefaultDirectory['linux'];
