import React, { useEffect, useState } from 'react';
import { Button } from '../Utils/Button';
import { FontPicker } from '../Utils/FontPicker';
import { useAppFont } from '../../hooks/useAppFont';
import { useStoreData } from '../../hooks/useStoreData';
import { useUpdateState } from '../../hooks/useUpdateState';
import { checkForUpdate, installUpdate, UPDATE_SETTING_KEY, updatesSupported, type UpdateState } from '../../platform/updates';
import { APP_FONT_OPTIONS } from '../../utils/fonts';
import {capabilityRows, ffmpegSetupHint, TOOLS_WITHOUT_NOTE, ytDlpSetupSteps} from '../../utils/toolSetup';
import {
  HOME_BODY,
  HOME_INNER_LABEL,
  HOME_INNER_PANEL,
  HOME_SECTION_LABEL,
  HOME_SHELL,
  HOME_STATUS_CHIP,
} from './homeMenuTheme';

const checkSymbol = ['❓', '✅', '🙃'] as const;

const StatusPill = ({
  symbol,
  message,
  variant = 'blue',
}: {
  symbol: string;
  message: string;
  variant?: 'blue' | 'green' | 'orange' | 'slate';
}) => {
  const variantClasses = {
    blue: 'bg-blue-50',
    green: 'bg-white',
    orange: 'bg-yellow-100',
    slate: 'bg-blue-50/80',
  };

  return (
    <div className={`${HOME_STATUS_CHIP} ${variantClasses[variant]}`}>
      <span>{symbol}</span>
      <span className="truncate">{message}</span>
    </div>
  );
};

interface HomeSystemPanelProps {
  liveCaptionsSymbol: string;
  liveCaptionsMessage: string;
  liveCaptionsTone: 'blue' | 'green' | 'orange' | 'slate';
  toolsCheckOk: number;
  toolsCheckMessage: string;
  toolsCheckInProgress: boolean;
  toolsCheckDetails?: Record<string, { available: boolean; isInternal?: boolean }>;
  isDownloading: string | false;
  onRefreshTools: () => void;
  onOpenToolsFolder: () => void;
  onDownloadTool: (toolName: string) => void;
  isRemovingCache: boolean;
  cacheCheckOk: number;
  cacheCheckMessage: string;
  showCacheStatus: boolean;
  onRemoveDictCaches: () => void;
}

/** The interface font, for every screen. Subtitle fonts are set per subtitle in the video settings. */
const AppearancePanel = () => {
  const [appFont, setAppFont] = useAppFont();
  return (
    <details className={HOME_INNER_PANEL} open>
      <summary className={`${HOME_INNER_LABEL} cursor-pointer rounded-t-2xl`}>Appearance</summary>
      <div className="space-y-2 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
        <div className="font-bold">Miteiru font</div>
        <FontPicker value={appFont} onChange={setAppFont} options={APP_FONT_OPTIONS} label="Miteiru font"
                    tone="light" sample="Aa あ 字"/>
        <p className="text-[11px] text-blue-800">Subtitle fonts are in the video settings (X), under Look.</p>
      </div>
    </details>
  );
};

const updateStatus = (state: UpdateState): string => {
  switch (state.kind) {
    case 'unsupported': return 'This copy of Miteiru does not update itself.';
    case 'checking': return 'Checking…';
    case 'current': return 'Miteiru is up to date.';
    case 'available': return `Miteiru ${state.version} is available.`;
    case 'downloading': return `Downloading Miteiru ${state.version}…`;
    case 'installing': return `Installing Miteiru ${state.version}…`;
    case 'error': return `Could not ${state.version ? 'install the update' : 'check for updates'}: ${state.message}`;
    default: return '';
  }
};

/** Updates from GitHub Releases (platform/updates.ts): the start-up check, and a manual one. */
const UpdatesPanel = () => {
  const state = useUpdateState();
  const [checkOnStart, setCheckOnStart] = useStoreData<boolean>(UPDATE_SETTING_KEY, true);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    updatesSupported().then(setSupported);
  }, []);
  const busy = state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'installing';
  return (
    <details className={HOME_INNER_PANEL}>
      <summary className={`${HOME_INNER_LABEL} cursor-pointer rounded-t-2xl`}>Updates</summary>
      <div className="space-y-2 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
        {supported === false ? (
          <p className="text-[12px] text-blue-800">{updateStatus({kind: 'unsupported'})} New versions are on GitHub.</p>
        ) : (
          <>
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={checkOnStart} onChange={(event) => setCheckOnStart(event.target.checked)}/>
              Check for updates when Miteiru starts
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="secondary" size="small" disabled={busy || supported === null} onPress={() => checkForUpdate()}>
                Check now
              </Button>
              {state.kind === 'available' && (
                <Button size="small" onPress={() => installUpdate()}>Restart to update</Button>
              )}
            </div>
            {updateStatus(state) && <p className="break-words text-[12px] text-blue-800">{updateStatus(state)}</p>}
          </>
        )}
      </div>
    </details>
  );
};

export const HomeSystemPanel: React.FC<HomeSystemPanelProps> = ({
  liveCaptionsSymbol,
  liveCaptionsMessage,
  liveCaptionsTone,
  toolsCheckOk,
  toolsCheckMessage,
  toolsCheckInProgress,
  toolsCheckDetails,
  isDownloading,
  onRefreshTools,
  onOpenToolsFolder,
  onDownloadTool,
  isRemovingCache,
  cacheCheckOk,
  cacheCheckMessage,
  showCacheStatus,
  onRemoveDictCaches,
}) => {
  const platform = typeof window === 'undefined' ? '' : window.electronAPI?.platform ?? '';
  const rows = capabilityRows(toolsCheckDetails);
  const checked = Boolean(toolsCheckDetails);
  const allFound = checked && rows.every((row) => row.found);
  const ytDlpMissing = checked && !rows[0].found;
  const ffmpegMissing = checked && !rows[1].found;
  const toolsPillMessage = toolsCheckInProgress
    ? 'Checking tools…'
    : !checked
      ? toolsCheckMessage
      : allFound
        ? 'YouTube and built-in subtitles ready'
        : 'Some subtitle helpers not found';
  return (
  <details className={`${HOME_SHELL} group`}>
    <summary className={`${HOME_SECTION_LABEL} flex cursor-pointer list-none items-center justify-between gap-3 rounded-t-3xl [&::-webkit-details-marker]:hidden`}>
      <span>Settings &amp; tools</span>
      <span className="text-[11px] font-semibold normal-case tracking-normal text-blue-800 group-open:hidden">
        Font · Updates · Live CC · Subtitle helpers · caches
      </span>
      <span className="hidden text-[11px] font-semibold normal-case tracking-normal text-blue-800 group-open:inline">
        Collapse
      </span>
    </summary>

    <div className={`${HOME_BODY} bg-blue-100 pt-4`}>
      <div className="flex flex-wrap gap-2">
        <StatusPill symbol={liveCaptionsSymbol} message={liveCaptionsMessage} variant={liveCaptionsTone} />
        <StatusPill symbol={checkSymbol[checked && !toolsCheckInProgress ? (allFound ? 1 : 2) : toolsCheckOk]} message={toolsPillMessage} variant="blue" />
        {showCacheStatus && (
          <StatusPill symbol={checkSymbol[cacheCheckOk]} message={cacheCheckMessage} variant="slate" />
        )}
      </div>

      <AppearancePanel/>

      <UpdatesPanel/>

      <details className={HOME_INNER_PANEL}>
        <summary className={`${HOME_INNER_LABEL} cursor-pointer rounded-t-2xl`}>YouTube and built-in subtitles</summary>
        <div className="space-y-2 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
          <div className="grid gap-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-blue-300 bg-white px-2 py-1 text-[12px] font-medium text-blue-900">
                <span>
                  {checked ? (row.found ? '✅' : '❌') : '⏳'} <b>{row.title}</b> · {row.needs} · {checked ? (row.found ? 'Found' : 'Not found') : 'Checking…'}
                </span>
                {checked && !row.found && (
                  <Button
                    type="link"
                    size="small"
                    disabled={isDownloading === row.getTool}
                    onPress={() => onDownloadTool(row.getTool)}
                  >
                    {isDownloading === row.getTool ? '…' : 'Get it'}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {ytDlpMissing && (
            <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-blue-800">
              {ytDlpSetupSteps(platform).map((step) => <li key={step}>{step}</li>)}
            </ul>
          )}
          {ffmpegMissing && <p className="text-[12px] text-blue-800">{ffmpegSetupHint(platform)}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="secondary" size="small" onPress={onOpenToolsFolder}>Open tools folder</Button>
            <Button type="secondary" size="small" disabled={toolsCheckInProgress} onPress={onRefreshTools}>
              {toolsCheckInProgress ? 'Checking…' : 'Check again'}
            </Button>
          </div>
          <p className="text-[12px] text-blue-800">{TOOLS_WITHOUT_NOTE}</p>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="danger" size="small" disabled={isRemovingCache} onPress={onRemoveDictCaches}>
          {isRemovingCache ? 'Removing…' : 'Remove dict caches'}
        </Button>
        <span className="text-[11px] font-medium text-blue-800">Requires 3 confirmations</span>
      </div>
    </div>
  </details>
  );
};
