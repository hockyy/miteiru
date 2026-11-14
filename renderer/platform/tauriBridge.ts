/**
 * Under Tauri there is no preload script: this installs window.backend, window.miteiru and
 * window.miteiruStore with the same shapes, routed to the backend worker (main/'s handlers, see
 * backend/worker.ts). Tauri's IPC only works on the main thread, so the worker's Rust calls come
 * here as `sys` messages and are invoked on its behalf.
 */
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {isMacPlatform} from '../utils/platform';
import type {AnalyzerRequestEvent, WorkerInbound, WorkerOutbound} from './backend/protocol';
import {SYS_KV_BATCH, SYS_WRITE_BYTES, SYS_ZSTD_DECOMPRESS} from './backend/protocol';
import {
  PLATFORM_API_INVOKE_CHANNELS,
  LANGUAGE_LOAD_CHANNELS,
  LANGUAGE_LOADED_EVENT,
  LIVE_CAPTIONS_EVENT_CHANNELS,
  LIVE_CAPTIONS_INVOKE_CHANNELS,
  STORE_CHANNELS
} from './platformApiChannels';

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
  if (cmd === SYS_KV_BATCH) {
    const {handle, data} = args as { handle: number; data: ArrayBuffer };
    await invoke(cmd, data, {headers: {'x-handle': String(handle)}});
    return [null, []];
  }
  if (cmd === SYS_ZSTD_DECOMPRESS) {
    const value = await invoke(cmd, (args as { data: ArrayBuffer }).data);
    return [value, value instanceof ArrayBuffer ? [value] : []];
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
    // Rust emits these for the worker (child processes it spawned, analyzer API requests); a worker
    // cannot listen to Tauri events itself.
    for (const event of ['data', 'exit'] as const) {
      listen(`proc://${event}`, ({payload}) => this.post({kind: 'proc-event', event, payload})).catch((error) => {
        console.error(`[backend] could not listen for proc://${event}:`, error);
      });
    }
    listen<AnalyzerRequestEvent>('analyzer://request', ({payload}) => this.post({kind: 'analyzer-request', payload})).catch((error) => {
      console.error('[backend] could not listen for analyzer requests:', error);
    });
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

type WebView2 = { postMessageWithAdditionalObjects: (message: string, objects: FileList) => void };

/** WebView2's page-side API, only there on Windows. */
const webView2 = () => (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;

const pendingDropPaths = new Map<number, (paths: string[]) => void>();
let nextDropId = 1;

/**
 * Windows hands drops to the page (src-tauri/src/webview2.rs), so dropped files come as
 * `File`s without paths. WebView2 passes them to the host, which answers with their paths.
 */
const listenForDropPaths = () => listen<{ id: number; paths: string[] }>('miteiru://file-drop', ({payload}) => {
  pendingDropPaths.get(payload.id)?.(payload.paths);
  pendingDropPaths.delete(payload.id);
}).catch((error) => console.error('[file-drop] could not listen for dropped file paths:', error));

/**
 * With drops going to the page, a file dropped where nothing takes it (the home page) would make
 * the webview open the file in place of the app. Pages that do take drops handle them first.
 */
const ignoreUnhandledFileDrops = () => {
  for (const type of ['dragover', 'drop'] as const) {
    window.addEventListener(type, (event) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    });
  }
};

const pathsForDroppedFiles = (files: FileList) => new Promise<string[]>((resolve) => {
  const id = nextDropId++;
  pendingDropPaths.set(id, resolve);
  // A string: see src-tauri/src/webview2.rs for why.
  webView2()?.postMessageWithAdditionalObjects(JSON.stringify({miteiru: 'file-drop', id}), files);
  setTimeout(() => {
    if (pendingDropPaths.delete(id)) resolve([]);
  }, 10000);
});

// ---- the loaded language across page reloads ------------------------------------------------

const LANGUAGE_KEY = 'miteiru.loadedLanguage';

const readSession = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSession = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Without storage a reload starts with no language loaded, as a fresh start does.
  }
};

/**
 * A page reload (F5, Ctrl+R) starts a new backend worker, which forgets the language the user
 * loaded; Electron's main process used to keep it. The language call is remembered for this
 * session and made again after a reload, and the tokenizer mode and any new language load wait for it
 * (otherwise the old language could finish last and win over the one just picked). A failed load is
 * not remembered.
 */
export const keepLanguageAcrossReloads = (invoke: (channel: string, args: unknown[]) => Promise<unknown>) => {
  const languageChannels: readonly string[] = LANGUAGE_LOAD_CHANNELS;
  const remembered = readSession(LANGUAGE_KEY);
  const restored = remembered && languageChannels.includes(remembered)
    ? invoke(remembered, []).catch((error) => console.error('[backend] could not load the language again:', error))
    : Promise.resolve();
  return async (channel: string, args: unknown[]) => {
    const isLanguageLoad = languageChannels.includes(channel);
    if (channel === 'getTokenizerMode' || isLanguageLoad) await restored;
    const result = await invoke(channel, args);
    if (isLanguageLoad && (result as {ok?: unknown} | null)?.ok === 1) writeSession(LANGUAGE_KEY, channel);
    return result;
  };
};

/** A language the backend loaded by itself (LANGUAGE_LOADED_EVENT) comes back after a reload too. */
export const rememberLoadedLanguage = (channel: unknown) => {
  if (typeof channel === 'string' && (LANGUAGE_LOAD_CHANNELS as readonly string[]).includes(channel)) {
    writeSession(LANGUAGE_KEY, channel);
  }
};

// ---- window.* installation ------------------------------------------------------------------

const detectPlatform = (): NodeJS.Platform => {
  const hint = `${navigator.platform} ${navigator.userAgent}`;
  if (/win/i.test(hint) && !/darwin/i.test(hint)) return 'win32';
  if (/mac/i.test(hint)) return 'darwin';
  return 'linux';
};

const buildPlatformAPI = (host: BackendHost) => {
  const api: Record<string, unknown> = {
    platform: detectPlatform(),
    onFileDrop
  };
  if (webView2()) {
    listenForDropPaths();
    ignoreUnhandledFileDrops();
    api.pathsForDroppedFiles = pathsForDroppedFiles;
  } else if (api.platform === 'darwin') {
    ignoreUnhandledFileDrops();
    api.pathsForDroppedFiles = () => invoke<string[]>('drop_paths_take');
  }
  for (const [method, channel] of Object.entries(PLATFORM_API_INVOKE_CHANNELS)) {
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

/** Installs the bridge; does nothing outside Tauri or when a preload already provided window.backend. */
export const installTauriBridge = () => {
  if (!isTauri() || 'backend' in window) return;

  const host = new BackendHost();
  const target = window as unknown as Record<string, unknown>;
  const invokeBackend = keepLanguageAcrossReloads((channel, args) => host.invoke(channel, args));
  host.on(LANGUAGE_LOADED_EVENT, rememberLoadedLanguage);
  target.backend = {
    invoke: (channel: string, ...args: unknown[]) => invokeBackend(channel, args),
    send: (channel: string, value: unknown) => host.send(channel, [value]),
    on: (channel: string, callback: Listener) => host.on(channel, callback)
  };
  target.miteiru = buildPlatformAPI(host);
  target.miteiruStore = {
    get: (key: string, defaultValue?: unknown) => host.invoke(STORE_CHANNELS.get, [key, defaultValue]),
    set: (key: string, value: unknown) => host.invoke(STORE_CHANNELS.set, [key, value])
  };
  document.addEventListener('keydown', toggleFullscreenOnShortcut);
  document.addEventListener('keydown', reloadPageOnShortcut);
  document.addEventListener('click', (event) => openLinkExternally(event, host));
  // CI's per-OS self-check (renderer/platform/smokeTest.ts), only when MITEIRU_SMOKE_TEST is set.
  invoke<{ smokeTest?: string | null; userData: string; platform: string }>('sys_info').then((info) => {
    if (info.smokeTest) {
      return import('./smokeTest').then(({runSmokeTest}) => runSmokeTest(info.smokeTest!, info.userData, info.platform));
    }
  }).catch((error) => console.error('[smoke] failed:', error));
};

/**
 * A plain link to another site would replace the app's page (Electron's will-navigate guard used
 * to stop that), so it opens in the system browser instead. Links that ask for a new window
 * (target=_blank, middle click) reach on_new_window in src-tauri/src/window.rs.
 */
const openLinkExternally = (event: MouseEvent, host: BackendHost) => {
  if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download')) return;
  let url: URL;
  try {
    url = new URL(link.getAttribute('href') ?? '', document.baseURI);
  } catch {
    return; // Not a URL; nothing would load.
  }
  if (url.origin === location.origin || !['http:', 'https:'].includes(url.protocol)) return;
  event.preventDefault();
  host.invoke(PLATFORM_API_INVOKE_CHANNELS.openExternal, [url.href])
    .catch((error) => console.error('[links] could not open', url.href, error));
};

/** F11, or Ctrl+Cmd+F on macOS: the full-screen toggle Electron's default menu used to provide. */
const toggleFullscreenOnShortcut = (event: KeyboardEvent) => {
  const macShortcut = event.ctrlKey && event.metaKey && event.key.toLowerCase() === 'f';
  if (event.key !== 'F11' && !macShortcut) return;
  event.preventDefault();
  const appWindow = getCurrentWindow();
  appWindow.isFullscreen()
    .then((fullscreen) => appWindow.setFullscreen(!fullscreen))
    .catch((error) => console.error('[window] could not toggle full screen:', error));
};

/** WKWebView has no default Cmd+R action in the packaged app's menu. */
export const reloadPageOnShortcut = (event: KeyboardEvent) => {
  if (event.defaultPrevented || !isMacPlatform() || !event.metaKey || event.ctrlKey ||
      event.altKey || event.shiftKey || event.key.toLowerCase() !== 'r') return;
  event.preventDefault();
  window.location.reload();
};
