/**
 * kuromoji with its dictionary path pointed at the copy served beside the app (/kuromoji-dict/,
 * copied by scripts/buildBackendWorker.mjs). The package's `browser` field makes it load
 * dictionaries with XHR, which is why they have to be served rather than read from disk.
 */
import realKuromoji from '../../../../node_modules/kuromoji/src/kuromoji.js';

export const DICTIONARY_URL = '/kuromoji-dict/';

const builder = (options: Record<string, unknown> = {}) => realKuromoji.builder({...options, dicPath: DICTIONARY_URL});

export {builder};
export default {builder};
