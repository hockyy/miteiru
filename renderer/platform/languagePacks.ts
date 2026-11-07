/**
 * Client for the Rust language pack commands (src-tauri/src/sys/langpack.rs). Importing this file is
 * safe anywhere: nothing talks to Tauri until a function is called.
 */
import {Channel, invoke} from '@tauri-apps/api/core';
import type {LanguagePack, LanguagePackProgress, LanguagePackStatus} from '../utils/languagePacks';

export type {LanguagePack, LanguagePackProgress, LanguagePackStatus};

export const langpackStatus = (): Promise<LanguagePackStatus> => invoke<LanguagePackStatus>('langpack_status');

const withProgress = (onProgress?: (progress: LanguagePackProgress) => void) => {
  const channel = new Channel<LanguagePackProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return channel;
};

export const langpackInstall = (id: string, onProgress?: (progress: LanguagePackProgress) => void): Promise<LanguagePack> =>
  invoke<LanguagePack>('langpack_install', {id, onProgress: withProgress(onProgress)});

export const langpackInstallFile = (path: string, onProgress?: (progress: LanguagePackProgress) => void): Promise<LanguagePack> =>
  invoke<LanguagePack>('langpack_install_file', {path, onProgress: withProgress(onProgress)});

export const langpackCancel = (id: string): Promise<null> => invoke<null>('langpack_cancel', {id});

export const langpackRemove = (id: string): Promise<null> => invoke<null>('langpack_remove', {id});

/** The file picker for "Install from a file…": the chosen path, or null when cancelled. */
export const pickLanguagePackFile = async (): Promise<string | null> => {
  const picked = await invoke<string[] | null>('dialog_open', {
    options: {
      title: 'Choose a Miteiru language pack',
      filters: [{name: 'Miteiru language pack', extensions: ['mtrpack']}],
      multiple: false,
      directory: false,
    },
  });
  return picked && picked.length > 0 ? picked[0] : null;
};

/** Opens a folder in the file manager. */
export const openFolder = async (path: string): Promise<void> => {
  await invoke('shell_open_path', {path});
};
