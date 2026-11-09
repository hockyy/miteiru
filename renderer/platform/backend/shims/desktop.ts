/**
 * The desktop API that main/ uses, backed by the Rust commands.
 * ipcMain is a registry the worker dispatches renderer invokes into; windows are one fake window
 * whose webContents.send posts an event back to the renderer.
 */
import pathe from 'pathe';
import {sys} from '../sys';
import {httpFetch} from './httpFetch';
import {appRoot, runtime} from './runtime';

type Listener = (event: IpcMainEvent, ...args: any[]) => unknown;
type EventSink = (channel: string, args: unknown[]) => void;

let sink: EventSink = () => undefined;

/** The worker sets where `webContents.send` events go. */
export const setEventSink = (next: EventSink) => {
  sink = next;
};

export interface IpcMainEvent {
  sender: FakeWebContents;
  /** Electron's invoke events have no `reply`; handlers here never use it either. */
  reply: (channel: string, ...args: unknown[]) => void;
}

class FakeWebContents {
  readonly id = 1;

  send = (channel: string, ...args: unknown[]) => sink(channel, args);

  isDestroyed() { return false; }
  getURL() { return ''; }
}

const webContents = new FakeWebContents();

class FakeWindow {
  readonly id = 1;
  readonly webContents = webContents;

  isDestroyed() { return false; }
  isFocused() { return true; }
  focus() { return undefined; }
}

const mainWindow = new FakeWindow();

const makeEvent = (): IpcMainEvent => ({
  sender: webContents,
  reply: (channel, ...args) => sink(channel, args)
});

const handlers = new Map<string, Listener>();
const listeners = new Map<string, Set<Listener>>();

export const ipcMain = {
  handle(channel: string, listener: Listener) {
    if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
    handlers.set(channel, listener);
  },
  handleOnce(channel: string, listener: Listener) {
    ipcMain.handle(channel, async (event, ...args) => {
      handlers.delete(channel);
      return listener(event, ...args);
    });
  },
  removeHandler(channel: string) {
    handlers.delete(channel);
  },
  on(channel: string, listener: Listener) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(listener);
    return ipcMain;
  },
  once(channel: string, listener: Listener) {
    const wrapper: Listener = (event, ...args) => {
      ipcMain.removeListener(channel, wrapper);
      return listener(event, ...args);
    };
    return ipcMain.on(channel, wrapper);
  },
  removeListener(channel: string, listener: Listener) {
    listeners.get(channel)?.delete(listener);
    return ipcMain;
  },
  removeAllListeners(channel?: string) {
    if (channel) listeners.delete(channel);
    else listeners.clear();
    return ipcMain;
  }
};

/** Runs the handler for an `ipcRenderer.invoke(channel, ...args)`. */
export const dispatchInvoke = async (channel: string, args: unknown[]) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for '${channel}'`);
  return handler(makeEvent(), ...args);
};

/** Runs the listeners for an `ipcRenderer.send(channel, ...args)`. */
export const dispatchSend = (channel: string, args: unknown[]) => {
  listeners.get(channel)?.forEach((listener) => {
    try {
      const result = listener(makeEvent(), ...args);
      if (result instanceof Promise) result.catch((error) => console.error(`[ipc] ${channel} listener failed:`, error));
    } catch (error) {
      console.error(`[ipc] ${channel} listener failed:`, error);
    }
  });
};

const appListeners = new Map<string, Set<(...args: unknown[]) => void>>();

const specialPaths = (name: string): string => {
  switch (name) {
    case 'userData': return runtime.userData;
    case 'temp': return runtime.temp;
    case 'home': return runtime.home;
    case 'appData': return pathe.dirname(runtime.userData);
    case 'exe': return runtime.exePath;
    case 'module': return runtime.exePath;
    case 'logs': return pathe.join(runtime.userData, 'logs');
    case 'cache': return pathe.join(runtime.userData, 'cache');
    case 'documents': return pathe.join(runtime.home, 'Documents');
    case 'downloads': return pathe.join(runtime.home, 'Downloads');
    case 'desktop': return pathe.join(runtime.home, 'Desktop');
    case 'music': return pathe.join(runtime.home, 'Music');
    case 'pictures': return pathe.join(runtime.home, 'Pictures');
    case 'videos': return pathe.join(runtime.home, 'Videos');
    default: throw new Error(`Failed to get '${name}' path`);
  }
};

export const app = {
  getPath: specialPaths,
  getVersion: () => runtime.version,
  getName: () => 'Miteiru',
  /** Bundled files live under the resources folder. */
  getAppPath: () => appRoot(),
  get isPackaged() { return runtime.isPackaged; },
  whenReady: () => Promise.resolve(),
  isReady: () => true,
  on(event: string, listener: (...args: unknown[]) => void) {
    if (!appListeners.has(event)) appListeners.set(event, new Set());
    appListeners.get(event).add(listener);
    return app;
  },
  once(event: string, listener: (...args: unknown[]) => void) { return app.on(event, listener); },
  off(event: string, listener: (...args: unknown[]) => void) {
    appListeners.get(event)?.delete(listener);
    return app;
  },
  quit: () => undefined
};

export const BrowserWindow = {
  getAllWindows: () => [mainWindow],
  getFocusedWindow: () => mainWindow,
  fromWebContents: () => mainWindow
};

interface FileFilter { name: string; extensions: string[] }

interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  properties?: string[];
}

const isWindow = (value: unknown): value is FakeWindow => value instanceof FakeWindow;

export const dialog = {
  async showOpenDialog(windowOrOptions: FakeWindow | OpenDialogOptions, maybeOptions?: OpenDialogOptions) {
    const options = (isWindow(windowOrOptions) ? maybeOptions : windowOrOptions) ?? {};
    const properties = options.properties ?? ['openFile'];
    const picked = await sys('dialog_open', {
      options: {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        multiple: properties.includes('multiSelections'),
        directory: properties.includes('openDirectory')
      }
    }) as string[] | null;
    return {canceled: !picked || picked.length === 0, filePaths: picked ?? []};
  },

  async showSaveDialog(windowOrOptions: FakeWindow | OpenDialogOptions, maybeOptions?: OpenDialogOptions) {
    const options = (isWindow(windowOrOptions) ? maybeOptions : windowOrOptions) ?? {};
    const picked = await sys('dialog_save', {
      options: {title: options.title, defaultPath: options.defaultPath, filters: options.filters}
    }) as string | null;
    return {canceled: !picked, filePath: picked ?? undefined};
  }
};

export const shell = {
  openExternal: async (url: string) => {
    await sys('shell_open_external', {url});
  },
  openPath: async (path: string): Promise<string> => (await sys('shell_open_path', {path})) ?? '',
  showItemInFolder: async (path: string) => {
    await sys('shell_show_item', {path});
  }
};

export const net = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => httpFetch(input, init)
};

const noop = () => undefined;

// Window plumbing that only exists in Electron (custom protocols, header rewriting) is skipped.
export const protocol = {
  registerSchemesAsPrivileged: noop,
  handle: noop,
  registerFileProtocol: noop,
  unhandle: noop
};

export const session = {
  defaultSession: {
    webRequest: {onBeforeSendHeaders: noop, onHeadersReceived: noop},
    setPermissionRequestHandler: noop
  }
};

export const contextBridge = {exposeInMainWorld: noop};
export const ipcRenderer = {};
export const webUtils = {getPathForFile: () => ''};

export default {app, BrowserWindow, dialog, shell, net, ipcMain, protocol, session};
