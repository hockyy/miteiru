import {useCallback, useEffect, useRef, useState} from 'react';
import {languageModes} from '../languages/manifest';
import {
  langpackCancel,
  langpackInstall,
  langpackInstallFile,
  langpackRemove,
  langpackStatus,
  pickLanguagePackFile,
} from '../platform/languagePacks';
import {
  downloadBytes,
  downloadedBytes,
  friendlyPackError,
  hasPackUi,
  installedMessage,
  languageReadyMessage,
  missingPacks,
  progressFraction,
  recoveredInstallLanguage,
  type LanguagePack,
  type LanguagePackProgress,
  type LanguagePackStatus,
  type PackError,
} from '../utils/languagePacks';

export interface PackInstallProgress {
  /** The language being installed, or null when installing from a file. */
  pluginId: string | null;
  /** Which pack of the sequence is installing now (0-based) and how many there are. */
  packIndex: number;
  packCount: number;
  /** The latest report from Rust for the current pack. */
  progress: LanguagePackProgress | null;
  /** 0 to 1 over every pack of the sequence. */
  fraction: number;
  /** Bytes downloaded so far and in total, for "12.3 of 33 MB". */
  doneBytes: number;
  totalBytes: number;
  /** True during the checksum and file-writing phases. */
  installing: boolean;
  /** A download can be cancelled; installing from a file cannot. */
  cancelable: boolean;
}

export interface LanguagePackError extends PackError {
  /** The language whose download failed, or null for a file or a removal. */
  pluginId: string | null;
}

const errorText = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as {message: unknown}).message);
  return String(error ?? '');
};

const languageNameOf = (pluginId: string | null) =>
  languageModes.find((mode) => mode.pluginId === pluginId)?.englishName ?? 'that language';

/**
 * The language packs on this computer: which are installed, and the one install that may run at a
 * time. Home and Settings share one instance so they never disagree.
 */
export const useLanguagePacks = () => {
  const [status, setStatus] = useState<LanguagePackStatus | null>(null);
  const [active, setActive] = useState<PackInstallProgress | null>(null);
  const [error, setError] = useState<LanguagePackError | null>(null);
  const [readyMessage, setReadyMessage] = useState<string | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    if (mounted.current) setBusyState(value);
  };
  const statusRef = useRef<LanguagePackStatus | null>(null);
  const currentPackId = useRef<string | null>(null);
  // Set by Cancel; checked before each pack, since a cancel between two packs has no job to stop.
  const cancelledRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await langpackStatus();
      statusRef.current = next;
      if (mounted.current) setStatus(next);
      return next;
    } catch {
      // Outside the app, or no pack support: behave as if there were no packs.
      statusRef.current = null;
      if (mounted.current) setStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fail = useCallback((raw: unknown, pluginId: string | null, languageName: string) => {
    const friendly = friendlyPackError(errorText(raw), languageName, statusRef.current?.appVersion);
    if (friendly && mounted.current) setError({...friendly, pluginId});
  }, []);

  // Installs Rust is running that this hook did not start (the page was reloaded, or Home was left
  // and came back): shown as the active download, and polled until they end.
  const outside = !busy ? (status?.running ?? []) : [];
  const outsideKey = outside.map((item) => item.id).join(',');
  useEffect(() => {
    if (!outsideKey) return;
    const timer = setInterval(() => {
      refresh();
    }, 500);
    return () => clearInterval(timer);
  }, [outsideKey, refresh]);
  const outsideActive = ((): PackInstallProgress | null => {
    const job = outside[0];
    if (!job) return null;
    const pack = status?.packs.find((candidate) => candidate.id === job.id);
    const packs = [{bytes: pack?.bytes ?? job.progress?.total ?? 0}];
    return {
      pluginId: recoveredInstallLanguage(pack, preferredLanguage),
      packIndex: 0,
      packCount: 1,
      progress: job.progress,
      fraction: progressFraction(job.progress, packs, 0),
      doneBytes: downloadedBytes(job.progress, packs, 0),
      totalBytes: packs[0].bytes,
      installing: Boolean(job.progress && job.progress.phase !== 'download'),
      cancelable: true,
    };
  })();

  const begin = () => {
    cancelledRef.current = false;
    setBusy(true);
    setError(null);
    setReadyMessage(null);
  };

  // Refreshes before Download comes back, so a finished pack never shows as missing for a moment.
  const finish = async () => {
    currentPackId.current = null;
    const next = await refresh();
    setBusy(false);
    if (mounted.current) setActive(null);
    return next;
  };

  /** Installs what the language is missing, one pack after another (a shared pack once). */
  const run = useCallback(async (
    packs: LanguagePack[],
    pluginId: string | null,
    languageName: string,
    ready: (status: LanguagePackStatus | null) => string,
  ) => {
    if (busyRef.current || packs.length === 0) return;
    begin();
    const totalBytes = downloadBytes(packs);
    const report = (index: number, progress: LanguagePackProgress | null) => {
      if (!mounted.current) return;
      setActive({
        pluginId,
        packIndex: index,
        packCount: packs.length,
        progress,
        fraction: progressFraction(progress, packs, index),
        doneBytes: downloadedBytes(progress, packs, index),
        totalBytes,
        installing: Boolean(progress && progress.phase !== 'download'),
        cancelable: true,
      });
    };
    let ok = true;
    try {
      for (let index = 0; index < packs.length; index++) {
        if (cancelledRef.current) {
          ok = false;
          break;
        }
        currentPackId.current = packs[index].id;
        report(index, null);
        await langpackInstall(packs[index].id, (progress) => report(index, progress));
      }
    } catch (raw) {
      ok = false;
      fail(raw, pluginId, languageName);
    }
    const next = await finish();
    if (ok && mounted.current) setReadyMessage(ready(next));
  }, [fail]);

  const install = useCallback(
    (pluginId: string) => run(missingPacks(statusRef.current, pluginId), pluginId, languageNameOf(pluginId),
      (next) => languageReadyMessage(next, pluginId, languageNameOf(pluginId))),
    [run],
  );

  /** Downloads (or updates) one pack by its id, from the Languages list. */
  const installPack = useCallback((id: string) => {
    const pack = statusRef.current?.packs.find((candidate) => candidate.id === id);
    if (!pack || pack.state === 'bundled') return Promise.resolve();
    return run([pack], null, pack.title, (next) => installedMessage(next, pack));
  }, [run]);

  /** "Install from a file…": pick a .mtrpack and install it. */
  const installFromFile = useCallback(async () => {
    if (busyRef.current) return;
    setBusy(true);
    let path: string | null = null;
    try {
      path = await pickLanguagePackFile();
    } catch (raw) {
      setBusy(false);
      fail(raw, null, 'that language');
      return;
    }
    if (!path) {
      setBusy(false);
      return;
    }
    begin();
    let installed: LanguagePack | null = null;
    try {
      installed = await langpackInstallFile(path, (progress) => {
        if (!mounted.current) return;
        const known = statusRef.current?.packs.find((pack) => pack.id === progress.id);
        const packs = [{bytes: known?.bytes ?? progress.total}];
        setActive({
          pluginId: null,
          packIndex: 0,
          packCount: 1,
          progress,
          fraction: progressFraction(progress, packs, 0),
          doneBytes: downloadedBytes(progress, packs, 0),
          totalBytes: packs[0].bytes,
          installing: progress.phase !== 'download',
          cancelable: false,
        });
      });
    } catch (raw) {
      fail(raw, null, 'that language');
    }
    const next = await finish();
    if (installed && mounted.current) setReadyMessage(installedMessage(next, installed));
  }, [fail]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    const ids = currentPackId.current ? [currentPackId.current] : statusRef.current?.running.map((item) => item.id) ?? [];
    for (const id of ids) {
      try {
        await langpackCancel(id);
      } catch {
        // Nothing to cancel any more.
      }
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    if (busyRef.current) return;
    setBusy(true);
    setError(null);
    setReadyMessage(null);
    try {
      await langpackRemove(id);
    } catch (raw) {
      fail(raw, null, 'that language');
    }
    await refresh();
    setBusy(false);
  }, [fail, refresh]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    status,
    /** False in development (no manifest): the home page shows no pack UI at all. */
    packsEnabled: hasPackUi(status),
    busy: busy || outside.length > 0,
    active: active ?? outsideActive,
    error,
    readyMessage,
    /** The language picked on Home, so a recovered shared-pack download is labelled with it. */
    setPreferredLanguage,
    install,
    installPack,
    installFromFile,
    cancel,
    remove,
    refresh,
    dismissError,
  };
};

export type LanguagePacksState = ReturnType<typeof useLanguagePacks>;
