/** What `sys_info` reports, kept where the synchronous Node APIs (os.tmpdir, process.platform...) can read it. */
export interface SysInfo {
  platform: 'win32' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64';
  release: string;
  version: string;
  userData: string;
  temp: string;
  home: string;
  resources: string;
  exePath: string;
  isPackaged: boolean;
}

const guessPlatform = (): SysInfo['platform'] => {
  const hint = typeof navigator !== 'undefined'
    ? `${navigator.platform} ${navigator.userAgent}`
    : String((globalThis as { process?: { platform?: string } }).process?.platform ?? '');
  if (/win/i.test(hint) && !/darwin/i.test(hint)) return 'win32';
  if (/mac|darwin/i.test(hint)) return 'darwin';
  return 'linux';
};

const platform = guessPlatform();

/** Filled with guesses until `initRuntime` runs with the real values. */
export const runtime: SysInfo = {
  platform,
  arch: 'x64',
  release: '',
  version: '0.0.0',
  userData: '',
  temp: platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp',
  home: '',
  resources: '',
  exePath: '',
  isPackaged: false
};

export const initRuntime = (info: SysInfo) => {
  Object.assign(runtime, info);
};
