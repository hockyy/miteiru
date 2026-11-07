import {runtime} from './runtime';

export const tmpdir = () => runtime.temp;
export const homedir = () => runtime.home;
export const platform = () => runtime.platform;
export const release = () => runtime.release;
export const arch = () => runtime.arch;
export const type = () => ({win32: 'Windows_NT', darwin: 'Darwin', linux: 'Linux'}[runtime.platform]);
export const hostname = () => 'miteiru';
export const cpus = () => [] as unknown[];
export const EOL = runtime.platform === 'win32' ? '\r\n' : '\n';

export default {tmpdir, homedir, platform, release, arch, type, hostname, cpus, get EOL() { return runtime.platform === 'win32' ? '\r\n' : '\n'; }};
