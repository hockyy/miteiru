/**
 * gzip/deflate over the platform's DecompressionStream (the browser has no zstd), and zstd through
 * the Rust command zstd_decompress. The only zlib calls main/ makes are decompressions of packaged assets.
 */
import {sys} from '../sys';
import {SYS_ZSTD_DECOMPRESS} from '../protocol';

type Callback = (error: Error | null, result?: Buffer) => void;

const run = async (data: Uint8Array, format: 'gzip' | 'deflate' | 'deflate-raw'): Promise<Buffer> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return Buffer.from(await new Response(stream).arrayBuffer());
};

const asCallbackApi = (format: 'gzip' | 'deflate' | 'deflate-raw') => (
  data: Uint8Array,
  optionsOrCallback: unknown,
  maybeCallback?: Callback
) => {
  const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as Callback;
  run(data, format).then((result) => callback(null, result), (error) => callback(error));
};

/**
 * zlib.zstdDecompress(data, [options], callback). The bytes are copied into a buffer of their own
 * first, because the worker hands the buffer over to the page (Buffers often view a shared pool).
 */
export const zstdDecompress = (data: Uint8Array, optionsOrCallback: unknown, maybeCallback?: Callback) => {
  const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as Callback;
  const body = new Uint8Array(data).buffer;
  sys(SYS_ZSTD_DECOMPRESS, {data: body}).then((result: ArrayBuffer | Uint8Array) => callback(null, Buffer.from(result as ArrayBuffer)), (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
};

export const gunzip = asCallbackApi('gzip');
export const inflate = asCallbackApi('deflate');
export const inflateRaw = asCallbackApi('deflate-raw');

const sync = (name: string) => () => {
  throw new Error(`zlib.${name} is not available in the Tauri backend worker; use the callback API`);
};

export const gunzipSync = sync('gunzipSync');
export const gzipSync = sync('gzipSync');
export const gzip = sync('gzip');

export const constants = {Z_BEST_COMPRESSION: 9, Z_BEST_SPEED: 1, Z_DEFAULT_COMPRESSION: -1};

export default {gunzip, zstdDecompress, inflate, inflateRaw, gunzipSync, gzipSync, gzip, constants};
