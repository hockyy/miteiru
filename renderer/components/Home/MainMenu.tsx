import React from 'react';
import { Button } from '../Utils/Button';
import { CopyButton } from '../Utils/CopyButton';
import { UI_LINK_PILL } from '../UI/miteiruUiTheme';
import { MITEIRU_REPO_URL } from '../../utils/constants';
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
  onLanguageChange: (modeId: number) => void;
  onOpenVideo: () => void;
  onOpenLearn: () => void;
  onOpenFlash: () => void;
  /** The video watched last, if it can still be opened, and the action that opens it. */
  lastVideo?: LastVideo | null;
  onContinue?: () => void;
}

const LanguageCard = ({mode, selected, onSelect}: { mode: LanguageMode; selected: boolean; onSelect: () => void }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    // One tab stop for the group, as for radio buttons; the arrow keys move between cards.
    tabIndex={selected ? 0 : -1}
    onClick={onSelect}
    className={[
      'flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition-colors',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500',
      selected
        ? 'border-blue-500 bg-blue-50 shadow-[0_3px_0_0_#93c5fd]'
        : 'border-blue-100 bg-white hover:border-blue-300 hover:bg-yellow-50',
    ].join(' ')}
  >
    <span className="text-3xl leading-none" aria-hidden="true">{mode.flag}</span>
    <span lang={mode.languageCode} className="max-w-full truncate text-base font-black text-blue-950">
      {mode.nativeName}
    </span>
    <span className="text-[11px] font-bold text-blue-800">{mode.englishName}</span>
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
  onLanguageChange,
  onOpenVideo,
  onOpenLearn,
  onOpenFlash,
  lastVideo = null,
  onContinue,
}) => {
  const selected = languageModes.find((mode) => mode.id === tokenizerMode);
  const blocked = !ableToProceedToVideo || isLoadingLanguage;
  const languageName = selected?.englishName ?? 'the language';

  // Arrow keys pick the next or previous language and move the focus with it, wrapping around.
  const onLanguageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
    if (!step || languageModes.length === 0) return;
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
                />
              ))}
            </div>
            {selected?.description && (
              <p lang={selected.languageCode} className="text-center text-xs font-semibold text-blue-900">
                {selected.description}
              </p>
            )}

            <div className="space-y-2">
              <Button
                type="primary"
                className={`w-full !py-3 !text-base ${blocked ? 'buttonDisabled' : ''}`}
                disabled={blocked}
                onPress={onOpenVideo}
              >
                {isLoadingLanguage ? `Getting ${languageName} ready…` : '▶  Watch a video'}
              </Button>
              <p className="text-center text-[11px] font-medium text-blue-800">
                {isLoadingLanguage
                  ? 'The first time takes a few seconds while the dictionary is set up.'
                  : 'Next, open a video file, drop one on the window, or paste a YouTube link.'}
              </p>
              {onContinue && <div className="flex justify-center">
                <ContinueWatchingButton video={lastVideo} onContinue={onContinue} disabled={blocked}/>
              </div>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="secondary" className={blocked ? 'buttonDisabled' : ''} disabled={blocked} onPress={onOpenLearn}>
                <span aria-hidden="true">📖</span> Study a text
              </Button>
              <Button type="secondary" className={blocked ? 'buttonDisabled' : ''} disabled={blocked} onPress={onOpenFlash}>
                <span aria-hidden="true">🃏</span> Flashcards
              </Button>
            </div>

            {languageNotice && (
              <div role="status" className="rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-semibold text-blue-900">
                <p>{languageNotice}</p>
                {languageNoticeDetails && (
                  <details className="mt-1 font-normal">
                    <summary className="cursor-pointer font-semibold">Details</summary>
                    <p className="mt-1 break-words text-blue-800">{languageNoticeDetails}</p>
                    <div className="mt-1">
                      <CopyButton text={languageNoticeDetails} label="Copy"
                                  className="border-blue-300 bg-white text-blue-900 hover:bg-blue-50"/>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
