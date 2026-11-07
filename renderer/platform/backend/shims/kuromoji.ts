/**
 * kuromoji, reading its dictionary (`*.dat` in language-assets/japanese/dict) through the backend's
 * fs. The package's `browser` field selects BrowserDictionaryLoader, which fetches each file by URL
 * with XHR; its one I/O method is replaced here, so the dictionary needs no copy served by the page.
 * kuromoji asks for `<name>.dat.gz`; packaged builds store `<name>.dat.zst` and development the
 * `.gz` as downloaded, so the Rust command fs_read_asset finds whichever exists and decompresses it.
 */
import realKuromoji from '../../../../node_modules/kuromoji/src/kuromoji.js';
import BrowserDictionaryLoader from '../../../../node_modules/kuromoji/src/loader/BrowserDictionaryLoader.js';
import {sys} from '../sys';
import {SYS_READ_ASSET} from '../protocol';

type LoadCallback = (error: unknown, buffer: ArrayBuffer | null) => void;

const GZIP_SUFFIX = '.gz';

BrowserDictionaryLoader.prototype.loadArrayBuffer = function (file: string, callback: LoadCallback) {
  const asset = file.endsWith(GZIP_SUFFIX) ? file.slice(0, -GZIP_SUFFIX.length) : file;
  sys(SYS_READ_ASSET, {path: asset}).then((buffer: ArrayBuffer) => callback(null, buffer), (error: unknown) => callback(error, null));
};

const builder = (options: Record<string, unknown> = {}) => realKuromoji.builder(options);

export {builder};
export default {builder};
