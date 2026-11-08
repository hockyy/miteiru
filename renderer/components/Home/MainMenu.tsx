import React, { useEffect, useState } from 'react';
import { Button } from '../Utils/Button';
import { CopyButton } from '../Utils/CopyButton';
import { UI_LINK_PILL } from '../UI/miteiruUiTheme';
import { MITEIRU_REPO_URL } from '../../utils/constants';
import type { LanguagePacksState } from '../../hooks/useLanguagePacks';
import { downloadBytes, formatProgressSize, formatSize, missingPacks } from '../../utils/languagePacks';
import type { LanguageMode } from '../../hooks/useLanguageManager';
import { ContinueWatchingButton } from '../VideoPlayer/ContinueWatchingButton';
import type { LastVideo } from '../../utils/continueWatching';
import {
  HOME_BODY,
  HOME_HEADER,
  HOME_ICON_BADGE,
  HOME_SECTION,
  HOME_SECTION_LABEL,
  HOME_SHELL,
} from './homeMenuTheme';

// Opens the system browser (the main process only allows http/https), never the app window.
const openRepository = () => {
  window.electronAPI.openExternal(MITEIRU_REPO_URL);
};

interface MainMenuProps {
  miteiruVersion: string;
  /** Something to tell the user about loading a language (an error, a notice), or null. */
  languageNotice: string | null;
  /** The raw reason behind a failure notice, shown under "Details" with a Copy button. */
  languageNoticeDetails?: string | null;
  languageModes: LanguageMode[];
  tokenizerMode: number;
  isLoadingLanguage: boolean;
  ableToProceedToVideo: boolean;
  /** True once the remembered language has been read; until then the selection is only a guess. */
  languageKnown?: boolean;
  onLanguageChange: (modeId: number) => void;
  onOpenVideo: () => void;
  onOpenLearn: () => void;
  onOpenFlash: () => void;
  /** The video watched last, if it can still be opened, and the action that opens it. */
  lastVideo?: LastVideo | null;
  onContinue?: () => void;
  /** The language packs (see useLanguagePacks). Without them, or in development, every language just loads. */
  packs?: LanguagePacksState;
}

/** A notice with the plain sentence first and the raw reason under "Details". */
const Notice = ({message, details = null, children}: { message: string; details?: string | null; children?: React.ReactNode }) => (
  <div role="status" className="rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-semibold text-blue-900">
    <p>{message}</p>
    {children}
    {details && (
      <details className="mt-1 font-normal">
        <summary className="cursor-pointer font-semibold">Details</summary>
        <p className="mt-1 break-words text-blue-800">{details}</p>
        <div className="mt-1">
          <CopyButton text={details} label="Copy"
                      className="border-blue-300 bg-white text-blue-900 hover:bg-blue-50"/>
        </div>
      </details>
    )}
  </div>
);

const LanguageCard = ({mode, selected, onSelect, extra, disabled = false}: {
  mode: LanguageMode; selected: boolean; onSelect: () => void;
  /** While a language loads the cards keep their place and ignore clicks. */
  disabled?: boolean;
  /** A small line under the name: what is still to download, or how far the download is. */
  extra?: string | null;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    aria-disabled={disabled || undefined}
    // One tab stop for the group, as for radio buttons; the arrow keys move between cards.
    tabIndex={selected ? 0 : -1}
    onClick={disabled ? undefined : onSelect}
    className={[
      'flex min-w-0 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition-colors',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500',
      disabled ? 'cursor-wait' : 'cursor-pointer',
      selected
        ? 'border-blue-500 bg-blue-50 shadow-[0_3px_0_0_#93c5fd]'
        : `border-blue-100 bg-white ${disabled ? '' : 'hover:border-blue-300 hover:bg-yellow-50'}`,
    ].join(' ')}
  >
    <span className="text-3xl leading-none" aria-hidden="true">{mode.flag}</span>
    <span lang={mode.languageCode} className="max-w-full truncate text-base font-black text-blue-950">
      {mode.nativeName}
    </span>
    <span className="text-[11px] font-bold text-blue-800">{mode.englishName}</span>
    {extra && <span className="text-[11px] font-semibold text-blue-700">{extra}</span>}
  </button>
);

/**
 * Home: pick the language you are learning, then watch. Studying text and flashcards are the
 * smaller ways in; settings and tools sit in their own panel below.
 */
export const MainMenu: React.FC<MainMenuProps> = ({
  miteiruVersion,
  languageNotice,
  languageNoticeDetails = null,
  languageModes,
  tokenizerMode,
  isLoadingLanguage,
  ableToProceedToVideo,
  languageKnown = true,
  onLanguageChange,
  onOpenVideo,
  onOpenLearn,
  onOpenFlash,
  lastVideo = null,
  onContinue,
  packs,
}) => {
  const selected = languageModes.find((mode) => mode.id === tokenizerMode);
  const blocked = !ableToProceedToVideo || isLoadingLanguage;
  const packStatus = packs?.packsEnabled ? packs.status : null;
  const missingFor = (mode: LanguageMode) => missingPacks(packStatus, mode.pluginId);
  const selectedMissing = selected ? missingFor(selected) : [];
  const needsDownload = selected !== undefined && selectedMissing.length > 0;
  const active = packs?.active ?? null;
  const packsBusy = Boolean(packs?.busy);
  // The selection is only a guess until the remembered language is read: it could be the wrong download.
  const downloadBlocked = packsBusy || !languageKnown;
  const downloadingSelected = Boolean(active && selected && active.pluginId === selected.pluginId);
  // Continue, Study and Flashcards wait for the data, and say why.
  const needsDownloadTitle = needsDownload && selected ? `Download ${selected.englishName} first` : undefined;
  const blockedForLanguage = blocked || needsDownload;
  // Loading is normally instant; only say it is taking a while once it really is.
  const [loadingIsSlow, setLoadingIsSlow] = useState(false);
  useEffect(() => {
    if (!isLoadingLanguage) {
      setLoadingIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setLoadingIsSlow(true), 2000);
    return () => clearTimeout(timer);
  }, [isLoadingLanguage]);
  const languageName = selected?.englishName ?? 'the language';
  const percent = active ? Math.round(active.fraction * 100) : 0;
  const downloadSize = formatSize(downloadBytes(selectedMissing));
  const activeName = active
    ? (languageModes.find((mode) => mode.pluginId === active.pluginId)?.englishName ?? 'the language pack')
    : '';
  const cardExtra = (mode: LanguageMode): string | null => {
    if (active && active.pluginId === mode.pluginId) return `${percent}%`;
    const missing = missingFor(mode);
    return missing.length > 0 ? `⬇ ${formatSize(downloadBytes(missing))}` : null;
  };

  // Arrow keys pick the next or previous language and move the focus with it, wrapping around.
  const onLanguageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
    if (!step || languageModes.length === 0) return;
    if (isLoadingLanguage) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const current = Math.max(0, languageModes.findIndex((mode) => mode.id === tokenizerMode));
    const next = (current + step + languageModes.length) % languageModes.length;
    onLanguageChange(languageModes[next].id);
    (event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next])?.focus();
  };

  return (
    <div className={HOME_SHELL}>
      <header className={HOME_HEADER}>
        <div className="flex items-center gap-3">
          <div className={HOME_ICON_BADGE}>🐸</div>
          <div>
            <div className="text-sm font-black tracking-tight text-blue-950">Miteiru</div>
            <div className="text-[11px] font-bold text-blue-800">v{miteiruVersion}</div>
          </div>
        </div>
        <button
          type="button"
          className={UI_LINK_PILL}
          title="Open Miteiru on GitHub. A star helps other learners find it"
          onClick={openRepository}
        >
          <span aria-hidden="true">⭐</span>
          Star on GitHub
        </button>
      </header>

      <div className={HOME_BODY}>
        <section className={HOME_SECTION}>
          <div className={HOME_SECTION_LABEL}>What are you learning?</div>
          <div className="space-y-4 bg-white px-4 py-4">
            <div
              role="radiogroup"
              aria-label="The language you are learning"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              onKeyDown={onLanguageKeyDown}
            >
              {languageModes.map((mode) => (
                <LanguageCard
                  key={mode.id}
                  mode={mode}
                  selected={mode.id === tokenizerMode}
                  onSelect={() => onLanguageChange(mode.id)}
                  disabled={isLoadingLanguage}
                  extra={cardExtra(mode)}
                />
              ))}
            </div>
            {selected?.description && (
              <p lang={selected.languageCode} className="text-center text-xs font-semibold text-blue-900">
                {selected.description}
              </p>
            )}

            <div className="space-y-2">
              {needsDownload ? (
                <Button
                  type="primary"
                  className={`w-full !py-3 !text-base ${downloadBlocked ? 'buttonDisabled' : ''}`}
                  disabled={downloadBlocked}
                  onPress={() => packs?.install(selected.pluginId)}
                >
                  {downloadingSelected
                    ? `Downloading ${languageName}… ${percent}%`
                    : `⬇  Download ${languageName} · ${downloadSize}`}
                </Button>
              ) : (
                <Button
                  type="primary"
                  className={`w-full !py-3 !text-base ${blocked ? 'buttonDisabled' : ''}`}
                  disabled={blocked}
                  onPress={onOpenVideo}
                >
                  {isLoadingLanguage ? `Getting ${languageName} ready…` : '▶  Watch a video'}
                </Button>
              )}
              {active && (
                <div className="space-y-1">
                  <div
                    role="progressbar"
                    aria-label={`Downloading ${activeName}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="h-2 w-full overflow-hidden rounded-full bg-blue-100"
                  >
                    <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{width: `${percent}%`}}/>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-blue-800">
                    <span>
                      {active.installing ? 'Installing…' : formatProgressSize(active.doneBytes, active.totalBytes)}
                      {active.packCount > 1 && !active.installing ? ` · part ${active.packIndex + 1} of ${active.packCount}` : ''}
                    </span>
                    {active.cancelable && (
                      <Button type="link" size="small" onPress={() => packs?.cancel()}>Cancel</Button>
                    )}
                  </div>
                </div>
              )}
              <p className="text-center text-[11px] font-medium text-blue-800">
                {needsDownload && !active ? (
                  <>
                    {languageName} needs its dictionaries, downloaded once from GitHub. Offline?{' '}
                    <Button type="link" size="small" disabled={packsBusy} onPress={() => packs?.installFromFile()}>
                      Install it from a file…
                    </Button>
                  </>
                ) : isLoadingLanguage
                  ? (loadingIsSlow ? 'Still getting ready. This can take longer on a slow disk.' : 'Just a moment…')
                  : needsDownload
                    ? 'Keep this window open until the download finishes.'
                    : 'Next, open a video file, drop one on the window, or paste a YouTube link.'}
              </p>
              {onContinue && <div className="flex justify-center">
                <ContinueWatchingButton video={lastVideo} onContinue={onContinue} disabled={blockedForLanguage}
                                        disabledTitle={needsDownloadTitle}/>
              </div>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="secondary" className={blockedForLanguage ? 'buttonDisabled' : ''} disabled={blockedForLanguage}
                      title={needsDownloadTitle} onPress={onOpenLearn}>
                <span aria-hidden="true">📖</span> Study a text
              </Button>
              <Button type="secondary" className={blockedForLanguage ? 'buttonDisabled' : ''} disabled={blockedForLanguage}
                      title={needsDownloadTitle} onPress={onOpenFlash}>
                <span aria-hidden="true">🃏</span> Flashcards
              </Button>
            </div>

            {packs?.error && (
              <Notice message={packs.error.message} details={packs.error.details}>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {packs.error.pluginId && (
                    <Button type="secondary" size="small" disabled={packsBusy}
                            onPress={() => packs.install(packs.error.pluginId)}>Retry</Button>
                  )}
                  <Button type="link" size="small" disabled={packsBusy} onPress={() => packs.installFromFile()}>
                    Install from a file…
                  </Button>
                </div>
              </Notice>
            )}

            {packs?.readyMessage && !packs.error && (
              <div role="status" className="text-center text-xs font-bold text-blue-900">{packs.readyMessage}</div>
            )}

            {languageNotice && <Notice message={languageNotice} details={languageNoticeDetails}/>}
          </div>
        </section>
      </div>
    </div>
  );
};
