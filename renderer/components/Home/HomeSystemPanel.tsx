import React from 'react';
import { Button } from '../Utils/Button';
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
      <span>System &amp; tools</span>
      <span className="text-[11px] font-semibold normal-case tracking-normal text-blue-800 group-open:hidden">
        Live CC · FFmpeg · caches
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
