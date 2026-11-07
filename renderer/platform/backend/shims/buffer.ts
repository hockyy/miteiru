import {Buffer} from 'buffer';

/*
 * The `buffer` package decodes UTF-8 with String.fromCharCode in chunks, which is slow and heavy for
 * the 100 MB dictionary files; the platform's TextDecoder does the same job natively. BOMs are kept
 * (ignoreBOM) like Node's toString does.
 */
const decoder = new TextDecoder('utf-8', {ignoreBOM: true});
const originalToString = Buffer.prototype.toString;

if (!(originalToString as { patched?: boolean }).patched) {
  const toString = function (this: Uint8Array, encoding?: string, start?: number, end?: number) {
    const normalized = encoding === undefined ? 'utf8' : String(encoding).toLowerCase();
    if (normalized === 'utf8' || normalized === 'utf-8') {
      return decoder.decode(this.subarray(start ?? 0, end ?? this.length));
    }
    return originalToString.call(this, encoding as BufferEncoding, start, end);
  };
  (toString as { patched?: boolean }).patched = true;
  Buffer.prototype.toString = toString as typeof Buffer.prototype.toString;
}

export {Buffer};
export default {Buffer};
