import {runtime} from './runtime';

/** `process.kill(pid, signal)`; child_process.ts points it at the process table. */
export const hooks = {
  kill: (pid: number): boolean => {
    throw new Error(`process.kill(${pid}): no such process`);
  }
};

type Listener = (...args: unknown[]) => void;
const listeners = new Map<string, Set<Listener>>();

/** A minimal `process` for the backend worker: the fields main/ reads, backed by sys_info. */
export const process = {
  get platform() { return runtime.platform; },
  get arch() { return runtime.arch; },
  get resourcesPath() { return runtime.resources; },
  get execPath() { return runtime.exePath; },
  env: { NODE_ENV: 'production' } as Record<string, string | undefined>,
  versions: {} as Record<string, string>,
  version: 'v22.0.0',
  argv: [] as string[],
  get pid() { return runtime.pid; },
  title: 'miteiru-backend',
  cwd: () => runtime.userData || '/',
  nextTick: (callback: Listener, ...args: unknown[]) => queueMicrotask(() => callback(...args)),
  kill: (pid: number) => hooks.kill(pid),
  hrtime: Object.assign(
    (previous?: [number, number]): [number, number] => {
      const now = performance.now();
      const seconds = Math.floor(now / 1000);
      const nanos = Math.floor((now % 1000) * 1e6);
      return previous ? [seconds - previous[0], nanos - previous[1]] : [seconds, nanos];
    },
    { bigint: () => BigInt(Math.floor(performance.now() * 1e6)) }
  ),
  emitWarning: (warning: unknown) => console.warn(warning),
  exit: (code?: number) => {
    throw new Error(`process.exit(${code ?? 0}) called in the backend worker`);
  },
  on(event: string, listener: Listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return process;
  },
  once(event: string, listener: Listener) { return process.on(event, listener); },
  off(event: string, listener: Listener) {
    listeners.get(event)?.delete(listener);
    return process;
  },
  removeListener(event: string, listener: Listener) { return process.off(event, listener); },
  emit(event: string, ...args: unknown[]) {
    listeners.get(event)?.forEach((listener) => listener(...args));
    return Boolean(listeners.get(event)?.size);
  }
};

export default process;
