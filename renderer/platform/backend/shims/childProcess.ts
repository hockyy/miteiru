/**
 * child_process over the proc_* commands. spawn/exec/execFile only; the synchronous variants cannot
 * exist here (main/ was converted to async spawn). Output arrives as `proc://data` events that the
 * worker forwards to `dispatchProcEvent`.
 */
import {EventEmitter} from 'events';
import {sys} from '../sys';
import {fromBase64, toBase64} from './bytes';
import {nodeError, type NodeError} from './errors';
import {hooks} from './process';
import {promisify} from './util';

interface ProcData { id: number; stream: 'stdout' | 'stderr'; data: string }
interface ProcExit { id: number; code: number | null; signal: string | null }

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  shell?: boolean | string;
  timeout?: number;
  windowsHide?: boolean;
  detached?: boolean;
  stdio?: unknown;
  /** Internal: a process object that never starts anything (answers an intercepted command). */
  noSpawn?: boolean;
}

class OutputStream extends EventEmitter {
  private decoder: TextDecoder | null = null;

  setEncoding() {
    this.decoder = new TextDecoder();
    return this;
  }

  push(bytes: Uint8Array) {
    this.emit('data', this.decoder ? this.decoder.decode(bytes, {stream: true}) : Buffer.from(bytes));
  }

  finish() {
    this.emit('end');
    this.emit('close');
  }

  resume() { return this; }
  pause() { return this; }
  destroy() { return this; }
}

class InputStream extends EventEmitter {
  constructor(private readonly owner: ChildProcess) {
    super();
  }

  write(data: string | Uint8Array, encodingOrCallback?: unknown, maybeCallback?: (error?: Error | null) => void) {
    const callback = typeof encodingOrCallback === 'function' ? encodingOrCallback as (error?: Error | null) => void : maybeCallback;
    const bytes = typeof data === 'string' ? Buffer.from(data) : data;
    this.owner.whenStarted().then((id) => sys('proc_write', {id, data: toBase64(bytes)}))
      .then(() => callback?.(null), (error) => {
        if (callback) callback(nodeError(error));
        else this.emit('error', nodeError(error));
      });
    return true;
  }

  end(data?: string | Uint8Array) {
    if (data !== undefined) this.write(data);
    this.owner.whenStarted().then((id) => sys('proc_end', {id})).catch(() => undefined);
    return this;
  }

  destroy() { return this.end(); }
}

export class ChildProcess extends EventEmitter {
  pid: number | undefined;
  killed = false;
  exitCode: number | null = null;
  signalCode: string | null = null;
  readonly stdout = new OutputStream();
  readonly stderr = new OutputStream();
  readonly stdin = new InputStream(this);
  readonly spawnargs: string[];
  readonly spawnfile: string;
  private started: Promise<number>;
  private killRequested = false;

  constructor(program: string, args: string[], options: SpawnOptions) {
    super();
    this.spawnfile = program;
    this.spawnargs = [program, ...args];
    this.started = options.noSpawn ? Promise.resolve(-1) : this.start(program, args, options);
    // Callers that never read stdin or listen for errors must not leave the rejection unhandled.
    this.started.catch(() => undefined);
    if (options.timeout && options.timeout > 0) {
      setTimeout(() => {
        if (this.exitCode === null && this.signalCode === null) this.kill();
      }, options.timeout);
    }
  }

  whenStarted() {
    return this.started;
  }

  private async start(program: string, args: string[], options: SpawnOptions): Promise<number> {
    const env = options.env
      ? Object.fromEntries(Object.entries(options.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
      : undefined;
    let id: number;
    try {
      if (options.shell) throw new Error('EPERM: Miteiru runs programs directly, never through a shell');
      id = await sys('proc_spawn', {program, args, cwd: options.cwd, env});
    } catch (raw) {
      const error: NodeError & { spawnargs?: string[] } = nodeError(raw);
      error.code ??= 'ENOENT';
      error.errno = -2;
      error.syscall = `spawn ${program}`;
      error.path = program;
      error.spawnargs = args;
      queueMicrotask(() => {
        this.emit('error', error);
        this.emit('close', -2, null);
      });
      throw error;
    }
    this.pid = id;
    registry.set(id, this);
    const early = pendingEvents.get(id);
    pendingEvents.delete(id);
    queueMicrotask(() => {
      this.emit('spawn');
      early?.forEach((event) => this.handleEvent(event));
    });
    if (this.killRequested) sys('proc_kill', {id}).catch(() => undefined);
    return id;
  }

  handleEvent(event: { event: 'data'; payload: ProcData } | { event: 'exit'; payload: ProcExit }) {
    if (event.event === 'data') {
      const bytes = fromBase64(event.payload.data);
      (event.payload.stream === 'stderr' ? this.stderr : this.stdout).push(bytes);
      return;
    }
    registry.delete(event.payload.id);
    this.exitCode = event.payload.code;
    this.signalCode = event.payload.signal;
    this.stdout.finish();
    this.stderr.finish();
    this.emit('exit', event.payload.code, event.payload.signal);
    this.emit('close', event.payload.code, event.payload.signal);
  }

  kill() {
    this.killed = true;
    if (this.pid === undefined) {
      this.killRequested = true;
    } else {
      sys('proc_kill', {id: this.pid}).catch(() => undefined);
    }
    return true;
  }

  unref() { return this; }
  ref() { return this; }
}

const registry = new Map<number, ChildProcess>();
// proc://data can reach the worker before proc_spawn's reply registers the id.
const pendingEvents = new Map<number, Parameters<ChildProcess['handleEvent']>[0][]>();

/** Called by the worker for every forwarded `proc://data` / `proc://exit` event. */
export const dispatchProcEvent = (event: 'data' | 'exit', payload: ProcData | ProcExit) => {
  const message = {event, payload} as Parameters<ChildProcess['handleEvent']>[0];
  const child = registry.get(payload.id);
  if (child) {
    child.handleEvent(message);
    return;
  }
  const queue = pendingEvents.get(payload.id) ?? [];
  queue.push(message);
  pendingEvents.set(payload.id, queue);
};

hooks.kill = (pid) => {
  const child = registry.get(pid);
  if (!child) {
    const error: NodeError = new Error('kill ESRCH');
    error.code = 'ESRCH';
    throw error;
  }
  child.kill();
  return true;
};

const stripExe = (program: string) => program.toLowerCase().replace(/\.exe$/, '');

/**
 * main/helpers/runCommand.ts stops a job with `taskkill /pid <child.pid> /T /F` on Windows. Here
 * child.pid is the backend's own process id, not an OS pid, so that command is answered by
 * proc_kill (which kills the whole tree) instead of being run.
 */
const interceptTaskkill = (program: string, args: string[]): ChildProcess | null => {
  if (stripExe(program) !== 'taskkill') return null;
  const index = args.findIndex((arg) => arg.toLowerCase() === '/pid');
  const target = registry.get(Number(args[index + 1]));
  if (index === -1 || !target) return null;
  target.kill();
  const stub = new ChildProcess(program, args, {noSpawn: true});
  queueMicrotask(() => stub.handleEvent({event: 'exit', payload: {id: -1, code: 0, signal: null}}));
  return stub;
};

export function spawn(program: string, argsOrOptions?: string[] | SpawnOptions, maybeOptions?: SpawnOptions) {
  const args = Array.isArray(argsOrOptions) ? argsOrOptions : [];
  const options = (Array.isArray(argsOrOptions) ? maybeOptions : argsOrOptions) ?? {};
  return interceptTaskkill(program, args) ?? new ChildProcess(program, args, options);
}

type ExecCallback = (error: (NodeError & { killed?: boolean; signal?: string | null; cmd?: string }) | null, stdout: string | Buffer, stderr: string | Buffer) => void;
type ExecOptions = SpawnOptions & { encoding?: string; maxBuffer?: number };

const collect = (child: ChildProcess, options: ExecOptions, command: string, callback?: ExecCallback) => {
  const asBuffer = options.encoding === 'buffer';
  const out: Uint8Array[] = [];
  const err: Uint8Array[] = [];
  child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
  const join = (chunks: Uint8Array[]) => {
    const merged = Buffer.concat(chunks);
    return asBuffer ? merged : merged.toString('utf8');
  };
  let done = false;
  const finish = (error: Parameters<ExecCallback>[0]) => {
    if (done) return;
    done = true;
    callback?.(error, join(out), join(err));
  };
  child.once('error', (error: NodeError) => finish(error));
  child.once('close', (code: number | null, signal: string | null) => {
    if (code === 0) {
      finish(null);
      return;
    }
    const error: NonNullable<Parameters<ExecCallback>[0]> = new Error(`Command failed: ${command}\n${Buffer.concat(err).toString('utf8')}`);
    (error as unknown as { code: number | null }).code = code;
    error.killed = child.killed;
    error.signal = signal;
    error.cmd = command;
    finish(error);
  });
  return child;
};

/** A shell command line: refused, as proc_spawn has no shell (use spawn or execFile). */
export function exec(command: string, optionsOrCallback?: ExecOptions | ExecCallback, maybeCallback?: ExecCallback) {
  const options = (typeof optionsOrCallback === 'function' ? {} : optionsOrCallback) ?? {};
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  return collect(new ChildProcess(command, [], {...options, shell: true}), options, command, callback);
}

export function execFile(file: string, argsOrOptions?: string[] | ExecOptions | ExecCallback, optionsOrCallback?: ExecOptions | ExecCallback, maybeCallback?: ExecCallback) {
  const args = Array.isArray(argsOrOptions) ? argsOrOptions : [];
  const rest = [Array.isArray(argsOrOptions) ? undefined : argsOrOptions, optionsOrCallback, maybeCallback];
  const callback = rest.find((entry) => typeof entry === 'function') as ExecCallback | undefined;
  const options = (rest.find((entry) => entry && typeof entry === 'object') ?? {}) as ExecOptions;
  return collect(new ChildProcess(file, args, options), options, [file, ...args].join(' '), callback);
}

const promisified = (start: (...args: any[]) => ChildProcess) => (...args: unknown[]) => new Promise((resolve, reject) => {
  start(...args, (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => (
    error ? reject(Object.assign(error, {stdout, stderr})) : resolve({stdout, stderr})
  ));
});
(exec as unknown as Record<symbol, unknown>)[promisify.custom] = promisified(exec);
(execFile as unknown as Record<symbol, unknown>)[promisify.custom] = promisified(execFile);

const syncUnavailable = (name: string) => () => {
  throw new Error(`child_process.${name} is not available in the Tauri backend worker; use the async API`);
};
export const spawnSync = syncUnavailable('spawnSync');
export const execSync = syncUnavailable('execSync');
export const execFileSync = syncUnavailable('execFileSync');

export default {spawn, exec, execFile, spawnSync, execSync, execFileSync, ChildProcess};
