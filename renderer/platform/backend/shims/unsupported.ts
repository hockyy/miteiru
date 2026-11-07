/**
 * node:http, node:stream and node:url are only imported by Electron-only code (the analyzer HTTP
 * server, the miteiru:// and app:// protocols), which the worker does not load. These stand-ins
 * keep an accidental import from breaking the bundle and fail loudly if actually used.
 */
const fail = (name: string) => (): never => {
  throw new Error(`${name} is not available in the Tauri backend worker`);
};

export const createServer = fail('http.createServer');
export class Readable {
  constructor() {
    fail('stream.Readable')();
  }
}

export const fileURLToPath = (value: string | URL): string => {
  const url = typeof value === 'string' ? new URL(value) : value;
  const decoded = decodeURIComponent(url.pathname);
  return /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded;
};

export const pathToFileURL = (path: string): URL => new URL(`file://${path.startsWith('/') ? '' : '/'}${path.replace(/\\/g, '/')}`);

export default {createServer, Readable, fileURLToPath, pathToFileURL};
