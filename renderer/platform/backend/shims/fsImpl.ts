/**
 * Node's async `fs` API over the Rust fs_* commands. Synchronous functions are deliberately absent:
 * main/ was converted to the async API, and a stray sync call should fail the bundle, not block.
 */
import {sys} from '../sys';
import {nodeError, type NodeError} from './errors';
import {runtime} from './runtime';

type PathLike = string | URL;
type ReadOptions = string | { encoding?: string | null; flag?: string } | null | undefined;
type WriteOptions = string | { encoding?: string | null; flag?: string; mode?: number } | null | undefined;

const toPath = (target: PathLike): string => {
  if (typeof target === 'string') return target;
  if (target instanceof URL) {
    const decoded = decodeURIComponent(target.pathname);
    return runtime.platform === 'win32' ? decoded.replace(/^\/([A-Za-z]:)/, '$1') : decoded;
  }
  throw new TypeError(`The "path" argument must be of type string or an instance of URL. Received ${typeof target}`);
};

const encodingOf = (options: ReadOptions | WriteOptions): string | null => (
  typeof options === 'string' ? options : options?.encoding ?? null
);

const isUtf8 = (encoding: string) => /^utf-?8$/i.test(encoding);

const call = async <T>(cmd: string, args: Record<string, unknown>): Promise<T> => {
  try {
    return await sys(cmd, args);
  } catch (error) {
    throw nodeError(error);
  }
};

export class Stats {
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly atimeMs: number;
  readonly birthtimeMs: number;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly atime: Date;
  readonly birthtime: Date;

  constructor(private readonly raw: { isFile: boolean; isDirectory: boolean; isSymbolicLink?: boolean; size: number; mtimeMs: number; birthtimeMs?: number }) {
    this.size = raw.size;
    this.mtimeMs = raw.mtimeMs;
    this.ctimeMs = raw.mtimeMs;
    this.atimeMs = raw.mtimeMs;
    this.birthtimeMs = raw.birthtimeMs ?? raw.mtimeMs;
    this.mtime = new Date(this.mtimeMs);
    this.ctime = new Date(this.ctimeMs);
    this.atime = new Date(this.atimeMs);
    this.birthtime = new Date(this.birthtimeMs);
  }

  isFile() { return this.raw.isFile; }
  isDirectory() { return this.raw.isDirectory; }
  isSymbolicLink() { return Boolean(this.raw.isSymbolicLink); }
}

export class Dirent {
  constructor(readonly name: string, private readonly file: boolean, private readonly directory: boolean) {}

  isFile() { return this.file; }
  isDirectory() { return this.directory; }
  isSymbolicLink() { return false; }
}

const missing = (operation: string, target: string): NodeError => {
  const error: NodeError = new Error(`ENOENT: no such file or directory, ${operation} '${target}'`);
  error.code = 'ENOENT';
  error.errno = -2;
  error.syscall = operation;
  error.path = target;
  return error;
};

export async function readFile(file: PathLike, options?: ReadOptions): Promise<any> {
  const path = toPath(file);
  const encoding = encodingOf(options);
  if (encoding && isUtf8(encoding)) {
    return call<string>('fs_read_text', {path});
  }
  const bytes = Buffer.from(await call<ArrayBuffer>('fs_read_bytes', {path}));
  return encoding ? bytes.toString(encoding as BufferEncoding) : bytes;
}

type WriteData = string | Uint8Array | ArrayBuffer | ArrayBufferView;

const writeData = async (file: PathLike, data: WriteData, options: WriteOptions, append: boolean) => {
  const path = toPath(file);
  const flag = typeof options === 'object' && options ? options.flag : undefined;
  const appending = append || Boolean(flag?.startsWith('a'));
  const encoding = encodingOf(options);
  const mode = typeof options === 'object' && options && typeof options.mode === 'number' ? options.mode : undefined;
  if (typeof data === 'string' && (!encoding || isUtf8(encoding))) {
    // Rust applies `mode` to an existing file too (src-tauri/src/sys/fs.rs, fs_write_text). Bytes
    // are written with the default permissions, as before: nothing secret is written that way.
    await call('fs_write_text', {path, text: data, append: appending, ...(mode === undefined ? {} : {mode})});
    return;
  }
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = Buffer.from(data, encoding as BufferEncoding);
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  // The bytes are copied: a Buffer can be a window onto a larger shared ArrayBuffer, which must not be transferred.
  await call('fs_write_bytes', {path, append: appending, data: bytes.slice().buffer});
};

export const writeFile = (file: PathLike, data: WriteData, options?: WriteOptions) => writeData(file, data, options, false);

export const appendFile = (file: PathLike, data: WriteData, options?: WriteOptions) => writeData(file, data, options, true);

export async function mkdir(target: PathLike, options?: number | { recursive?: boolean; mode?: number }): Promise<string | undefined> {
  const recursive = typeof options === 'object' && Boolean(options?.recursive);
  await call('fs_mkdir', {path: toPath(target), recursive});
  return undefined;
}

export async function readdir(target: PathLike, options?: { withFileTypes?: boolean } | string): Promise<any[]> {
  const entries = await call<{ name: string; isFile: boolean; isDirectory: boolean }[]>('fs_readdir', {path: toPath(target)});
  if (typeof options === 'object' && options?.withFileTypes) {
    return entries.map((entry) => new Dirent(entry.name, entry.isFile, entry.isDirectory));
  }
  return entries.map((entry) => entry.name);
}

export async function stat(target: PathLike): Promise<Stats> {
  const path = toPath(target);
  const raw = await call<ConstructorParameters<typeof Stats>[0] | null>('fs_stat', {path});
  if (!raw) throw missing('stat', path);
  return new Stats(raw);
}

export async function lstat(target: PathLike): Promise<Stats> {
  const path = toPath(target);
  const raw = await call<ConstructorParameters<typeof Stats>[0] | null>('fs_stat', {path});
  if (!raw) throw missing('lstat', path);
  return new Stats(raw);
}

export async function access(target: PathLike): Promise<void> {
  const path = toPath(target);
  if (!await call('fs_stat', {path})) throw missing('access', path);
}

export async function realpath(target: PathLike): Promise<string> {
  const path = toPath(target);
  if (!await call('fs_stat', {path})) throw missing('realpath', path);
  return path;
}

export async function unlink(target: PathLike): Promise<void> {
  await call('fs_rm', {path: toPath(target), recursive: false, force: false});
}

export async function rmdir(target: PathLike, options?: { recursive?: boolean }): Promise<void> {
  await call('fs_rm', {path: toPath(target), recursive: Boolean(options?.recursive), force: false});
}

// A database "folder" such as jmdict-db is a `<folder>.sqlite3` file here (kv_open); deleting the
// cache folder has to delete that file too, or the next import would start from the old keys.
const KV_SIDECARS = ['.sqlite3', '.sqlite3-wal', '.sqlite3-shm'];
const looksLikeKvLocation = (path: string) => !/\.[^/\\]*$/.test(path);

export async function rm(target: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
  const path = toPath(target);
  const recursive = Boolean(options?.recursive);
  const force = Boolean(options?.force);
  await call('fs_rm', {path, recursive, force});
  if (recursive && force && looksLikeKvLocation(path)) {
    for (const suffix of KV_SIDECARS) {
      await call('fs_rm', {path: path + suffix, recursive: false, force: true});
    }
  }
}

export async function rename(from: PathLike, to: PathLike): Promise<void> {
  await call('fs_rename', {from: toPath(from), to: toPath(to)});
}

export async function copyFile(from: PathLike, to: PathLike): Promise<void> {
  await call('fs_copy', {from: toPath(from), to: toPath(to)});
}

export async function mkdtemp(prefix: string): Promise<string> {
  return call<string>('fs_mkdtemp', {prefix});
}

export const constants = {F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, COPYFILE_EXCL: 1};

const unsupported = (name: string) => () => {
  throw new Error(`fs.${name} is not available in the Tauri backend worker`);
};

export const createReadStream = unsupported('createReadStream');
export const createWriteStream = unsupported('createWriteStream');

/** The part of Node's FileHandle that reading a pack entry needs: read and close. */
export class FileHandle {
  private position = 0;
  private closed = false;

  constructor(private readonly path: string) {}

  async read<T extends ArrayBufferView>(buffer: T, offset = 0, length?: number, position?: number | null): Promise<{ bytesRead: number; buffer: T }> {
    if (this.closed) throw Object.assign(new Error('EBADF: bad file descriptor, read'), {code: 'EBADF', syscall: 'read'});
    const target = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const wanted = Math.min(length ?? target.length - offset, target.length - offset);
    if (wanted <= 0) return {bytesRead: 0, buffer};
    const at = typeof position === 'number' ? position : this.position;
    const bytes = new Uint8Array(await call<ArrayBuffer>('fs_read_range', {path: this.path, offset: at, length: wanted}));
    target.set(bytes.subarray(0, wanted), offset);
    if (typeof position !== 'number') this.position += bytes.length;
    return {bytesRead: Math.min(bytes.length, wanted), buffer};
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

// Read-only for now: table reads (main/helpers/dataTable.ts) are the one use.
export async function open(target: PathLike, flags: string | number = 'r'): Promise<FileHandle> {
  if (flags !== 'r') unsupported('open with flags other than "r"')();
  const path = toPath(target);
  const raw = await call<ConstructorParameters<typeof Stats>[0] | null>('fs_stat', {path});
  if (!raw) throw missing('open', path);
  if (raw.isDirectory) {
    const error: NodeError = new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    error.code = 'EISDIR';
    error.errno = -21;
    error.syscall = 'read';
    error.path = path;
    throw error;
  }
  return new FileHandle(path);
}
