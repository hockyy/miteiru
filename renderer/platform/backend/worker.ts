/**
 * The Tauri backend: main/'s Electron handlers running in a Web Worker. main/ talks to the shims in
 * ./shims (aliased in by scripts/buildBackendWorker.mjs), which call Rust through the main thread.
 *
 * Mirrors main/main.ts's startup wiring. Skipped on purpose (Electron-only), as a TODO list:
 *  - TODO: miteiru:// and app:// protocols (media/subtitle streaming to the renderer) - Tauri's
 *    asset protocol or a Rust-side equivalent has to serve local media files.
 *  - TODO: the YouTube embed header workaround (session.webRequest) - needs a webview-level hook.
 *  - TODO: the analyzer HTTP server (startAnalyzerServer) - needs a Rust-side listener.
 *  - TODO: generate-subtitles handlers are not registered by main/ either (registerGenerateSubtitlesHandlers).
 *  - TODO: live-captions helper lookup (candidates under resources/live-captions) once it is bundled.
 */
import {setSys} from './sys';
import type {WorkerInbound, WorkerOutbound} from './protocol';
import {SYS_WRITE_BYTES} from './protocol';
import {initRuntime, type SysInfo} from './shims/runtime';
import {dispatchInvoke, dispatchSend, setEventSink} from './shims/electron';
import {dispatchProcEvent} from './shims/childProcess';
import {installFetch} from './shims/httpFetch';
import {openStore} from './shims/electronStore';
import fsImpl from './shims/fsPromises';
import pathe from 'pathe';

const scope = self as unknown as {
  postMessage: (message: WorkerOutbound, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerInbound>) => void) | null;
};

const post = (message: WorkerOutbound, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

// ---- syscalls: worker -> main thread -> Rust -------------------------------------------------

let nextSysId = 1;
const pendingSys = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();

setSys((cmd, args) => new Promise((resolve, reject) => {
  const id = nextSysId++;
  pendingSys.set(id, {resolve, reject});
  const transfer: Transferable[] = [];
  if (cmd === SYS_WRITE_BYTES && args?.data instanceof ArrayBuffer) transfer.push(args.data);
  post({kind: 'sys', id, cmd, args}, transfer);
}));

// ---- renderer events: webContents.send -------------------------------------------------------

setEventSink((channel, args) => {
  try {
    post({kind: 'event', channel, args});
  } catch {
    // Not structured-cloneable (a class instance with methods): JSON is what Electron's IPC would send anyway.
    post({kind: 'event', channel, args: JSON.parse(JSON.stringify(args))});
  }
});

// ---- boot ------------------------------------------------------------------------------------

/**
 * The folder holding `language-assets/` (what Electron's `__dirname` was). In a dev run the repo's
 * renderer/public is used, so `tauri dev` works without bundling; a packaged app reads the copy under
 * the resource directory (tauri.conf.json bundle.resources).
 */
const resolveAssetRoot = async (info: SysInfo) => {
  const candidates: string[] = [];
  if (!info.isPackaged && info.exePath) {
    // <repo>/src-tauri/target/<profile>/miteiru(.exe)
    const repo = pathe.dirname(pathe.dirname(pathe.dirname(pathe.dirname(info.exePath))));
    candidates.push(pathe.join(repo, 'renderer/public'));
  }
  candidates.push(info.resources, pathe.join(info.resources, 'resources'));
  for (const candidate of candidates) {
    try {
      if ((await fsImpl.stat(pathe.join(candidate, 'language-assets'))).isDirectory()) return candidate;
    } catch {
      // Not here; try the next place.
    }
  }
  console.warn('[backend] language-assets was not found; looked in', candidates);
  return info.resources;
};

const boot = async () => {
  const info = await new Promise<SysInfo>((resolve, reject) => {
    const id = nextSysId++;
    pendingSys.set(id, {resolve: resolve as (value: unknown) => void, reject});
    post({kind: 'sys', id, cmd: 'sys_info'});
  });
  initRuntime(info);
  installFetch();

  // main/ reads __dirname for its bundled assets; it is a free variable here, so it is set before main/ loads.
  (globalThis as { __dirname?: string }).__dirname = await resolveAssetRoot(info);

  // Loaded only now: some of these modules read process.platform or __dirname when they load.
  const [
    {registerCommonHandlers},
    {notifyLiveCaptionsLanguageChange},
    {registerStartupHandlers},
    {default: Japanese},
    {default: Chinese},
    {default: Vietnamese},
    {default: Learning},
    {registerAnalyzerHandlers},
    {getStore, setStoreFactory}
  ] = await Promise.all([
    import('../../../main/handler/common'),
    import('../../../main/handler/common/liveCaptionsHandlers'),
    import('../../../main/handler/startup'),
    import('../../../main/handler/japanese'),
    import('../../../main/handler/chinese'),
    import('../../../main/handler/vietnamese'),
    import('../../../main/handler/learning'),
    import('../../../main/handler/languages/analyzerHandlers'),
    import('../../../main/handler/common/storeHandlers')
  ]);

  setStoreFactory(() => openStore());

  const appDataDirectory = info.userData;
  const packageJson = {version: info.version};
  let tokenizerCommand = '';
  const setTokenizer = (value: string) => {
    tokenizerCommand = value;
    notifyLiveCaptionsLanguageChange();
  };
  const getTokenizer = () => tokenizerCommand;
  const getToneType = async () => {
    const store = await getStore();
    return store.get('toneType', 'num') as string;
  };

  registerCommonHandlers(getTokenizer, packageJson, appDataDirectory);
  registerStartupHandlers(setTokenizer, appDataDirectory);
  registerAnalyzerHandlers({getTokenizer, getToneType});
  Japanese.registerHandlers();
  Chinese.registerHandlers();
  Vietnamese.registerHandlers();
  Japanese.preloadKuromoji();

  Learning.setup();
  Learning.registerHandler();
};

const booted = boot().then(
  () => post({kind: 'ready'}),
  (error) => {
    console.error('[backend] boot failed:', error);
    post({kind: 'boot-error', error: error instanceof Error ? error.message : String(error)});
    throw error;
  }
);
booted.catch(() => undefined);

// ---- messages from the main thread -----------------------------------------------------------

const replyToInvoke = async (id: number, channel: string, args: unknown[]) => {
  try {
    await booted;
    const value = await dispatchInvoke(channel, args);
    try {
      post({kind: 'invoke-result', id, ok: true, value});
    } catch {
      post({kind: 'invoke-result', id, ok: true, value: value === undefined ? undefined : JSON.parse(JSON.stringify(value))});
    }
  } catch (error) {
    post({kind: 'invoke-result', id, ok: false, error: error instanceof Error ? error.message : String(error)});
  }
};

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.kind) {
    case 'sys-result': {
      const pending = pendingSys.get(message.id);
      pendingSys.delete(message.id);
      if (!pending) return;
      if (message.ok) pending.resolve(message.value);
      else pending.reject(message.error);
      return;
    }
    case 'invoke':
      void replyToInvoke(message.id, message.channel, message.args);
      return;
    case 'send':
      booted.then(() => dispatchSend(message.channel, message.args), () => undefined);
      return;
    case 'proc-event':
      dispatchProcEvent(message.event, message.payload as never);
      return;
  }
};

