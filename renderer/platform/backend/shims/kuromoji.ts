/**
 * kuromoji, reading its dictionary (`*.dat.gz` in language-assets/japanese/dict) through the backend's
 * fs. The package's `browser` field selects BrowserDictionaryLoader, which fetches each file by URL
 * with XHR; its one I/O method is replaced here, so the dictionary needs no copy served by the page.
 */
import realKuromoji from '../../../../node_modules/kuromoji/src/kuromoji.js';
import BrowserDictionaryLoader from '../../../../node_modules/kuromoji/src/loader/BrowserDictionaryLoader.js';
import {readFile} from './fsImpl';

type LoadCallback = (error: unknown, buffer: ArrayBuffer | null) => void;

const gunzip = (bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> =>
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();

BrowserDictionaryLoader.prototype.loadArrayBuffer = function (file: string, callback: LoadCallback) {
  readFile(file)
    .then((bytes: Uint8Array<ArrayBuffer>) => gunzip(bytes))
    .then((buffer) => callback(null, buffer), (error) => callback(error, null));
};

const builder = (options: Record<string, unknown> = {}) => realKuromoji.builder(options);

export {builder};
export default {builder};
