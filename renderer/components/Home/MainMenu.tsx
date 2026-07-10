import React from 'react';
import { Button } from '../Utils/Button';
import SmoothCollapse from '../Utils/SmoothCollapse';
import {
  HOME_BODY,
  HOME_HEADER,
  HOME_ICON_BADGE,
  HOME_INNER_PANEL,
  HOME_SECTION,
  HOME_SECTION_LABEL,
  HOME_SHELL,
  HOME_STATUS_PILL,
  MEANING_FIELD_INPUT,
} from './homeMenuTheme';

const checkSymbol = ['❓', '✅', '🙃'] as const;

interface LanguageMode {
  id: number;
  name: string;
  emoji: string;
  description: string;
}

interface MainMenuProps {
  miteiruVersion: string;
  checkOk: number;
  checkMessage: string;
  languageModes: LanguageMode[];
  tokenizerMode: number;
  lastLanguageMode: number | null;
  selectedLanguageMode?: LanguageMode;
  isLoadingLanguage: boolean;
  ableToProceedToVideo: boolean;
  mecab: string;
  onLanguageChange: (modeId: number) => void;
  onMecabChange: (path: string) => void;
  onSelectMecabPath: () => void;
  onOpenVideo: () => void;
  onOpenLearn: () => void;
  onOpenFlash: () => void;
  formatLanguageOption: (mode: LanguageMode, isLastUsed: boolean) => string;
}

const ModeCard = ({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: string;
  children: React.ReactNode;
}) => (
  <article className={HOME_SECTION}>
    <div className={HOME_SECTION_LABEL}>
      <span className="mr-2">{icon}</span>
      {title}
    </div>
    <div className="space-y-2 bg-white px-4 py-3">
      <p className="text-xs font-medium text-blue-800">{description}</p>
      {children}
    </div>
  </article>
);

export const MainMenu: React.FC<MainMenuProps> = ({
  miteiruVersion,
  checkOk,
  checkMessage,
  languageModes,
  tokenizerMode,
  lastLanguageMode,
  selectedLanguageMode,
  isLoadingLanguage,
  ableToProceedToVideo,
  mecab,
  onLanguageChange,
  onMecabChange,
  onSelectMecabPath,
  onOpenVideo,
  onOpenLearn,
  onOpenFlash,
  formatLanguageOption,
}) => (
  <div className={HOME_SHELL}>
    <header className={HOME_HEADER}>
      <div className="flex items-center gap-3">
        <div className={HOME_ICON_BADGE}>🐸</div>
        <div>
          <div className="text-sm font-black tracking-tight text-blue-950">Miteiru</div>
          <div className="text-[11px] font-bold text-blue-800">v{miteiruVersion}</div>
        </div>
      </div>
      <div className={HOME_STATUS_PILL}>
        {checkSymbol[checkOk]} {checkMessage}
      </div>
    </header>

    <div className={HOME_BODY}>
      <section className={HOME_SECTION}>
        <div className={HOME_SECTION_LABEL}>What are we doing today?</div>
        <div className="space-y-3 bg-white px-4 py-3">
          <p className="text-xs font-medium text-blue-800">Pick a language once, then jump into any mode.</p>

          <label htmlFor="language-select" className="block text-xs font-bold uppercase tracking-wide text-blue-900">
            Language stack
          </label>
          <select
            id="language-select"
            value={tokenizerMode}
            onChange={(e) => onLanguageChange(Number(e.target.value))}
            className={`${MEANING_FIELD_INPUT} cursor-pointer rounded-xl`}
          >
            {languageModes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {formatLanguageOption(mode, lastLanguageMode === mode.id)}
              </option>
            ))}
          </select>
          {selectedLanguageMode?.description && (
            <p className="text-xs font-semibold text-blue-900">{selectedLanguageMode.description}</p>
          )}

          <SmoothCollapse expanded={tokenizerMode === 1}>
            <div className={`${HOME_INNER_PANEL} p-2.5`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button onPress={onSelectMecabPath}>Mecab path</Button>
                <input
                  className={`${MEANING_FIELD_INPUT} rounded-xl text-xs`}
                  type="text"
                  value={mecab}
                  onChange={(e) => onMecabChange(e.target.value)}
                />
              </div>
            </div>
          </SmoothCollapse>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <ModeCard title="Watch" description="Load subtitles and play video" icon="▶️">
          <Button
            type="primary"
            className={`w-full ${ableToProceedToVideo ? '' : 'buttonDisabled'}`}
            disabled={!ableToProceedToVideo || isLoadingLanguage}
            onPress={onOpenVideo}
          >
            {isLoadingLanguage ? 'Loading…' : 'Open video'}
          </Button>
        </ModeCard>

        <ModeCard title="Learn" description="Analyze text with AI tools" icon="📖">
          <Button
            type="secondary"
            className={`w-full ${ableToProceedToVideo ? '' : 'buttonDisabled'}`}
            disabled={!ableToProceedToVideo || isLoadingLanguage}
            onPress={onOpenLearn}
          >
            {isLoadingLanguage ? 'Loading…' : 'Open learn'}
          </Button>
        </ModeCard>

        <ModeCard title="Flashcards" description="Review saved vocabulary" icon="🃏">
          <Button
            type="secondary"
            className={`w-full ${ableToProceedToVideo ? '' : 'buttonDisabled'}`}
            disabled={!ableToProceedToVideo || isLoadingLanguage}
            onPress={onOpenFlash}
          >
            {isLoadingLanguage ? 'Loading…' : 'Open flashcards'}
          </Button>
        </ModeCard>
      </div>
    </div>
  </div>
);
