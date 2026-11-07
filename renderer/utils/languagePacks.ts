/**
 * Pure helpers for on-demand language packs (the commands are in platform/languagePacks.ts).
 * A language needs every pack whose `languages` lists its plugin id; `missing` is the only state
 * that blocks it (`outdated` data still reads fine).
 */

export type PackState = 'bundled' | 'installed' | 'outdated' | 'missing';

export interface LanguagePack {
  id: string;
  title: string;
  file: string;
  bytes: number;
  sha256: string;
  plugins: string[];
  languages: string[];
  state: PackState;
  dir: string | null;
  installedSha256: string | null;
}

export interface LanguagePackStatus {
  manifestFound: boolean;
  root: string;
  baseUrl: string;
  appVersion: string;
  packs: LanguagePack[];
}

export interface LanguagePackProgress {
  id: string;
  phase: 'download' | 'verify' | 'install';
  done: number;
  total: number;
}

export interface PackError {
  message: string;
  /** The raw error text, for "Details". */
  details: string | null;
}

/** Pack UI exists only when the build has a manifest; otherwise every language is available. */
export const hasPackUi = (status: LanguagePackStatus | null | undefined): status is LanguagePackStatus =>
  Boolean(status && status.manifestFound);

export const packsForLanguage = (status: LanguagePackStatus | null | undefined, pluginId: string): LanguagePack[] =>
  status ? status.packs.filter((pack) => pack.languages.includes(pluginId)) : [];

export const missingPacks = (status: LanguagePackStatus | null | undefined, pluginId: string): LanguagePack[] =>
  packsForLanguage(status, pluginId).filter((pack) => pack.state === 'missing');

export const isLanguageAvailable = (status: LanguagePackStatus | null | undefined, pluginId: string): boolean =>
  !hasPackUi(status) || missingPacks(status, pluginId).length === 0;

export const downloadBytes = (packs: readonly Pick<LanguagePack, 'bytes'>[]): number =>
  packs.reduce((sum, pack) => sum + (Number.isFinite(pack.bytes) ? pack.bytes : 0), 0);

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "33 MB", "0.6 MB" (one decimal under 10 MB), "1.2 GB". */
export const formatSize = (bytes: number): string => {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (value >= GB) return `${(value / GB).toFixed(1)} GB`;
  const mb = value / MB;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
};

// Where each phase sits inside one pack's share of the bar: the download is most of it,
// then the checksum, then writing the files (the last few percent).
const DOWNLOAD_SHARE = 0.9;
const VERIFY_END = 0.95;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

const withinPack = (progress: LanguagePackProgress): number => {
  const ratio = progress.total > 0 ? clamp01(progress.done / progress.total) : 0;
  switch (progress.phase) {
    case 'download': return ratio * DOWNLOAD_SHARE;
    case 'verify': return DOWNLOAD_SHARE + ratio * (VERIFY_END - DOWNLOAD_SHARE);
    case 'install': return VERIFY_END + ratio * (1 - VERIFY_END);
  }
};

/**
 * One bar over several packs installed in sequence, weighted by bytes. `index` is the pack being
 * installed now; the ones before it count as done.
 */
export const progressFraction = (
  progress: LanguagePackProgress | null | undefined,
  packs: readonly Pick<LanguagePack, 'bytes'>[],
  index: number,
): number => {
  if (packs.length === 0) return 0;
  const total = downloadBytes(packs);
  const current = Math.min(Math.max(index, 0), packs.length - 1);
  if (total <= 0) {
    // No sizes known: spread the packs evenly.
    return clamp01((current + (progress ? withinPack(progress) : 0)) / packs.length);
  }
  const finished = packs.slice(0, current).reduce((sum, pack) => sum + pack.bytes, 0);
  const now = progress ? packs[current].bytes * withinPack(progress) : 0;
  return clamp01((finished + now) / total);
};

/** Bytes downloaded so far across the sequence, for "12.3 of 33 MB". */
export const downloadedBytes = (
  progress: LanguagePackProgress | null | undefined,
  packs: readonly Pick<LanguagePack, 'bytes'>[],
  index: number,
): number => {
  if (packs.length === 0) return 0;
  const current = Math.min(Math.max(index, 0), packs.length - 1);
  const finished = packs.slice(0, current).reduce((sum, pack) => sum + pack.bytes, 0);
  if (!progress) return finished;
  const ratio = progress.phase === 'download' && progress.total > 0 ? clamp01(progress.done / progress.total) : 1;
  return finished + packs[current].bytes * ratio;
};

const PACK_NAMES: Record<string, string> = {
  japanese: 'Japanese',
  hanzi: 'Chinese character strokes',
  mandarin: 'Chinese',
  cantonese: 'Cantonese',
  vietnamese: 'Vietnamese',
};

const parseError = (message: string): { code: string; status: string; detail: string } => {
  const match = /^\s*([A-Z]{3,})(?:\s+(\d{3}))?\s*:?\s*([\s\S]*)$/.exec(message);
  return match
    ? {code: match[1], status: match[2] ?? '', detail: match[3].trim()}
    : {code: '', status: '', detail: message.trim()};
};

/**
 * One plain sentence for a language pack error ("<CODE>: <detail>"), with the raw text kept for
 * Details. Returns null when there is nothing to show (the learner cancelled).
 */
export const friendlyPackError = (message: string, languageName: string, appVersion?: string): PackError | null => {
  const raw = (message ?? '').trim();
  const {code, status, detail} = parseError(raw);
  switch (code) {
    case 'ECANCELED':
      return null;
    case 'ENETWORK':
      return {
        message: `Couldn't reach GitHub to download ${languageName}. Check the connection, then try again, or install it from a file.`,
        details: raw,
      };
    case 'EHTTP':
      return status === '404'
        ? {
          message: "This version's language downloads aren't on GitHub (yet). Install from a file, or try a released version.",
          details: raw,
        }
        : {
          message: `GitHub answered with an error${status ? ` (${status})` : ''} while downloading ${languageName}. Try again in a little while.`,
          details: raw,
        };
    case 'ECHECKSUM':
    case 'ESIZE':
      return {message: 'The download was damaged on the way. Try again.', details: raw};
    case 'EVERSION': {
      const packName = PACK_NAMES[detail.toLowerCase().split(/[\s,.:;]/)[0]] ?? languageName;
      const release = appVersion
        ? `Download the one for v${appVersion.replace(/^v/, '')} from its release page.`
        : 'Download the one for this version from its release page.';
      return {message: `That file is the ${packName} pack for a different version of Miteiru. ${release}`, details: raw};
    }
    case 'EBADPACK':
      return {message: "That file isn't a Miteiru language pack.", details: raw};
    case 'EBUSY':
      return {message: `${languageName} is already downloading.`, details: raw};
    case 'EIO':
      return {
        message: detail ? `Couldn't save the download: ${detail.replace(/\.$/, '')}.` : "Couldn't save the download.",
        details: raw,
      };
    default:
      return {message: `Couldn't install ${languageName}.`, details: raw || null};
  }
};

/** The state as a word for the Languages list. */
export const packStateLabel = (state: PackState): string => {
  switch (state) {
    case 'bundled': return 'Built in';
    case 'installed': return 'Installed';
    case 'outdated': return 'Update available';
    case 'missing': return 'Not downloaded';
  }
};

/** "12.3 of 33 MB": the amount so far with one decimal, then the total. */
export const formatProgressSize = (done: number, total: number): string => {
  const soFar = Math.min(Math.max(done, 0), total > 0 ? total : done);
  const totalText = formatSize(total);
  if (total >= GB) return `${formatSize(soFar)} of ${totalText}`;
  return `${(soFar / MB).toFixed(1)} of ${totalText}`;
};
