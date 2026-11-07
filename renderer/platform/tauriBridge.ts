/**
 * Under Tauri there is no preload script: this installs window.ipc, window.electronAPI and
 * window.electronStore with the same shapes, routed to the backend worker (main/'s handlers, see
 * backend/worker.ts). Tauri's IPC only works on the main thread, so the worker's Rust calls come
 * here as `sys` messages and are invoked on its behalf.
 */
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import type {WorkerInbound, WorkerOutbound} from './backend/protocol';
import {SYS_WRITE_BYTES} from './backend/protocol';
import {
  ELECTRON_API_INVOKE_CHANNELS,
  LIVE_CAPTIONS_EVENT_CHANNELS,
  LIVE_CAPTIONS_INVOKE_CHANNELS,
  STORE_CHANNELS
} from './electronApiChannels';

type Listener = (...args: unknown[]) => void;

const WORKER_URL = '/backend-worker.js';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs one Rust command for the worker; the second value lists ArrayBuffers to transfer back. */
const runSys = async (cmd: string, args: Record<string, unknown> | undefined): Promise<[unknown, Transferable[]]> => {
  if (cmd === SYS_WRITE_BYTES) {
    const {path, append, data} = args as { path: string; append: boolean; data: ArrayBuffer };
    await invoke(cmd, data, {headers: {'x-path': encodeURIComponent(path), 'x-append': append ? '1' : '0'}});
    return [null, []];
  }
  const value = await invoke(cmd, args);
  return [value, value instanceof ArrayBuffer ? [value] : []];
};

class BackendHost {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly subscribers = new Map<string, Set<Listener>>();

  constructor() {
    this.worker = new Worker(WORKER_URL);
    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => this.onWorkerMessage(event.data);
    this.worker.onerror = (event) => this.failAll(`The backend worker failed: ${event.message || WORKER_URL}`);
    this.forwardProcessEvents();
  }

  invoke(channel: string, args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, {resolve, reject});
      this.post({kind: 'invoke', id, channel, args});
    });
  }

  send(channel: string, args: unknown[]) {
    this.post({kind: 'send', channel, args});
  }

  on(channel: string, listener: Listener) {
    if (!this.subscribers.has(channel)) this.subscribers.set(channel, new Set());
    this.subscribers.get(channel).add(listener);
    return () => {
      this.subscribers.get(channel)?.delete(listener);
    };
  }

  private post(message: WorkerInbound, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }

  private forwardProcessEvents() {
    // Rust emits these for child processes the worker spawned (proc_spawn); the worker cannot listen itself.
    for (const event of ['data', 'exit'] as const) {
      listen(`proc://${event}`, ({payload}) => this.post({kind: 'proc-event', event, payload})).catch((error) => {
        console.error(`[backend] could not listen for proc://${event}:`, error);
      });
    }
  }

  private failAll(reason: string) {
    this.pending.forEach(({reject}) => reject(new Error(reason)));
    this.pending.clear();
  }

  private onWorkerMessage(message: WorkerOutbound) {
    switch (message.kind) {
      case 'sys':
        void this.runSysFor(message.id, message.cmd, message.args);
        return;
      case 'invoke-result': {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!pending) return;
        if (message.ok) pending.resolve(message.value);
        else pending.reject(new Error(message.error));
        return;
      }
      case 'event':
        this.subscribers.get(message.channel)?.forEach((listener) => listener(...message.args));
        return;
      case 'boot-error':
        console.error('[backend] failed to start:', message.error);
        return;
      case 'ready':
        return;
    }
  }

  private async runSysFor(id: number, cmd: string, args: Record<string, unknown> | undefined) {
    try {
      const [value, transfer] = await runSys(cmd, args);
      this.post({kind: 'sys-result', id, ok: true, value}, transfer);
    } catch (error) {
      this.post({kind: 'sys-result', id, ok: false, error: errorMessage(error)});
    }
  }
}

// ---- OS file drops --------------------------------------------------------------------------

type FileDropListener = { onDrop: (paths: string[]) => void; onHover?: (hovering: boolean) => void };

const fileDropListeners = new Set<FileDropListener>();
let fileDropRegistered = false;

/**
 * With `dragDropEnabled` the webview does not deliver DOM drop events for files; Tauri sends its own
 * drag-drop event with the dropped paths instead.
 */
const registerFileDropOnce = () => {
  if (fileDropRegistered) return;
  fileDropRegistered = true;
  getCurrentWebview().onDragDropEvent(({payload}) => {
    if (payload.type === 'enter') fileDropListeners.forEach((entry) => entry.onHover?.(true));
    else if (payload.type === 'leave') fileDropListeners.forEach((entry) => entry.onHover?.(false));
    else if (payload.type === 'drop') {
      fileDropListeners.forEach((entry) => {
        entry.onHover?.(false);
        entry.onDrop(payload.paths);
      });
    }
  }).catch((error) => {
    fileDropRegistered = false;
    console.error('[file-drop] could not listen for drag-drop events:', error);
  });
};

const onFileDrop = (onDrop: (paths: string[]) => void, onHover?: (hovering: boolean) => void) => {
  const entry = {onDrop, onHover};
  fileDropListeners.add(entry);
  registerFileDropOnce();
  return () => {
    fileDropListeners.delete(entry);
  };
};

// ---- window.* installation ------------------------------------------------------------------

const detectPlatform = (): NodeJS.Platform => {
  const hint = `${navigator.platform} ${navigator.userAgent}`;
  if (/win/i.test(hint) && !/darwin/i.test(hint)) return 'win32';
  if (/mac/i.test(hint)) return 'darwin';
  return 'linux';
};

const buildElectronApi = (host: BackendHost) => {
  const api: Record<string, unknown> = {
    platform: detectPlatform(),
    // Electron adds .path to dropped File objects; under Tauri drops arrive through onFileDrop instead.
    getPath: (file: File) => file?.path ?? '',
    onFileDrop
  };
  for (const [method, channel] of Object.entries(ELECTRON_API_INVOKE_CHANNELS)) {
    api[method] = (...args: unknown[]) => host.invoke(channel, args);
  }

  const liveCaptions: Record<string, unknown> = {};
  for (const [method, channel] of Object.entries(LIVE_CAPTIONS_INVOKE_CHANNELS)) {
    liveCaptions[method] = () => host.invoke(channel, []);
  }
  for (const [method, channel] of Object.entries(LIVE_CAPTIONS_EVENT_CHANNELS)) {
    liveCaptions[method] = (callback: Listener) => host.on(channel, callback);
  }
  api.liveCaptions = liveCaptions;
  return api;
};

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Installs the bridge; does nothing outside Tauri or when a preload already provided window.ipc. */
export const installTauriBridge = () => {
  if (!isTauri() || 'ipc' in window) return;

  const host = new BackendHost();
  const target = window as unknown as Record<string, unknown>;
  target.ipc = {
    invoke: (channel: string, ...args: unknown[]) => host.invoke(channel, args),
    send: (channel: string, value: unknown) => host.send(channel, [value]),
    on: (channel: string, callback: Listener) => host.on(channel, callback)
  };
  target.electronAPI = buildElectronApi(host);
  target.electronStore = {
    get: (key: string, defaultValue?: unknown) => host.invoke(STORE_CHANNELS.get, [key, defaultValue]),
    set: (key: string, value: unknown) => host.invoke(STORE_CHANNELS.set, [key, value])
  };
};
