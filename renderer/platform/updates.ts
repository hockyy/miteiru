/**
 * In-app updates (tauri-plugin-updater). Release builds read `latest.json` from the newest GitHub
 * release and install a signed update: the NSIS installer on Windows, the app bundle on macOS, the
 * AppImage on Linux. Only release builds whose updater has a public key check at all (sys_info's
 * `updates`); the .deb is updated by the package manager.
 *
 * One state for the whole app, shared by the notice (components/UI/UpdateNotice.tsx) and the
 * settings panel (components/Home/HomeSystemPanel.tsx).
 */
import {invoke} from '@tauri-apps/api/core';
import {check, type Update} from '@tauri-apps/plugin-updater';
import {relaunch} from '@tauri-apps/plugin-process';

export type UpdateState =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; version: string; notes?: string }
  | { kind: 'downloading'; version: string; percent: number | null }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string; version?: string };

export const UPDATE_SETTING_KEY = 'checkForUpdates';
export const RELEASES_URL = 'https://github.com/hockyy/miteiru/releases/latest';

let state: UpdateState = {kind: 'idle'};
let pending: Update | null = null;
let supported: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

const setState = (next: UpdateState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

export const getUpdateState = () => state;

export const subscribeToUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Whether this build checks for updates at all; false outside the desktop app. */
export const updatesSupported = () => {
  supported ??= typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? invoke<{ updates?: boolean }>('sys_info').then((info) => Boolean(info.updates), () => false)
    : Promise.resolve(false);
  return supported;
};

export const checkForUpdate = async () => {
  if (!(await updatesSupported())) {
    setState({kind: 'unsupported'});
    return;
  }
  if (state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'installing') return;
  setState({kind: 'checking'});
  try {
    const update = await check({timeout: 30000});
    await pending?.close().catch(() => undefined);
    pending = update;
    setState(update ? {kind: 'available', version: update.version, notes: update.body} : {kind: 'current'});
  } catch (error) {
    setState({kind: 'error', message: errorText(error)});
  }
};

/** Downloads and installs the update found by checkForUpdate, then restarts Miteiru. */
export const installUpdate = async () => {
  const update = pending;
  if (!update) return;
  let total = 0;
  let received = 0;
  setState({kind: 'downloading', version: update.version, percent: null});
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') total = event.data.contentLength ?? 0;
      if (event.event === 'Progress') {
        received += event.data.chunkLength;
        setState({kind: 'downloading', version: update.version, percent: total ? Math.min(100, Math.round(received / total * 100)) : null});
      }
      if (event.event === 'Finished') setState({kind: 'installing', version: update.version});
    });
    // Windows leaves through the installer before this; macOS and Linux start the new version here.
    await relaunch();
  } catch (error) {
    setState({kind: 'error', message: errorText(error), version: update.version});
  }
};
