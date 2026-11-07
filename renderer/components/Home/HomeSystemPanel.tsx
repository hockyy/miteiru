import React, { useEffect, useState } from 'react';
import { Button } from '../Utils/Button';
import { FontPicker } from '../Utils/FontPicker';
import { useAppFont } from '../../hooks/useAppFont';
import { useStoreData } from '../../hooks/useStoreData';
import { useUpdateState } from '../../hooks/useUpdateState';
import { checkForUpdate, installUpdate, UPDATE_SETTING_KEY, updatesSupported, type UpdateState } from '../../platform/updates';
import { APP_FONT_OPTIONS } from '../../utils/fonts';
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
  toolsCheckMissingTools?: string[];
  toolsCheckCached?: boolean;
  isDownloading: string | false;
  onRefreshTools: () => void;
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
  toolsCheckMissingTools,
  toolsCheckCached,
  isDownloading,
  onRefreshTools,
  onDownloadTool,
  isRemovingCache,
  cacheCheckOk,
  cacheCheckMessage,
  showCacheStatus,
  onRemoveDictCaches,
}) => (
  <details className={`${HOME_SHELL} group`}>
    <summary className={`${HOME_SECTION_LABEL} flex cursor-pointer list-none items-center justify-between gap-3 rounded-t-3xl [&::-webkit-details-marker]:hidden`}>
      <span>Settings &amp; tools</span>
      <span className="text-[11px] font-semibold normal-case tracking-normal text-blue-800 group-open:hidden">
        Font · Updates · Live CC · FFmpeg · caches
      </span>
      <span className="hidden text-[11px] font-semibold normal-case tracking-normal text-blue-800 group-open:inline">
        Collapse
      </span>
    </summary>

    <div className={`${HOME_BODY} bg-blue-100 pt-4`}>
      <div className="flex flex-wrap gap-2">
        <StatusPill symbol={liveCaptionsSymbol} message={liveCaptionsMessage} variant={liveCaptionsTone} />
        <StatusPill symbol={checkSymbol[toolsCheckOk]} message={toolsCheckInProgress ? 'Checking tools…' : toolsCheckMessage} variant="blue" />
        {showCacheStatus && (
          <StatusPill symbol={checkSymbol[cacheCheckOk]} message={cacheCheckMessage} variant="slate" />
        )}
      </div>

      <AppearancePanel/>

      <UpdatesPanel/>

      <details className={HOME_INNER_PANEL}>
        <summary className={`${HOME_INNER_LABEL} cursor-pointer rounded-t-2xl`}>Optional media tools</summary>
        <div className="space-y-2 bg-blue-50 px-3 py-2.5">
          <Button type="secondary" size="small" disabled={toolsCheckInProgress} onPress={onRefreshTools}>
            {toolsCheckInProgress ? 'Checking…' : 'Refresh'}
          </Button>

          {toolsCheckDetails && (
            <div className="grid max-h-24 gap-1 overflow-y-auto">
              {Object.entries(toolsCheckDetails).map(([toolName, status]) => (
                <div key={toolName} className="flex items-center justify-between gap-2 rounded-xl border-2 border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-900">
                  <span className="truncate">
                    {status.available ? '✅' : '❌'} {toolName}
                    {status.isInternal ? ' (internal)' : ''}
                  </span>
                  {!status.available && (
                    <Button
                      type="link"
                      size="small"
                      disabled={isDownloading === toolName}
                      onPress={() => onDownloadTool(toolName)}
                    >
                      {isDownloading === toolName ? '…' : 'Link'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {toolsCheckMissingTools && toolsCheckMissingTools.length > 0 && (
            <p className="text-[11px] font-semibold text-blue-800">Missing: {toolsCheckMissingTools.join(', ')}</p>
          )}

          {toolsCheckCached && !toolsCheckInProgress && (
            <p className="text-[11px] text-blue-700">Cached result — refresh to update</p>
          )}
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
