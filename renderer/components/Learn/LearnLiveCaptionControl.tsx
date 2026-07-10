/** Live CC toggle for /learn — uses shared UI kit tokens (see components/UI). */
import React, {useMemo} from 'react';
import {liveCaptionRefreshIntervals} from '../../types/liveCaptions';
import {
  MiteiruPanel,
  UI_ACTION_BTN,
  UI_ACTION_BTN_LIVE,
  UI_ACTION_BTN_PRIMARY,
  UI_ERROR_BANNER,
  UI_HINT_TEXT,
} from '../UI';

interface LearnLiveCaptionControlProps {
  supported: boolean;
  running: boolean;
  starting: boolean;
  state: string;
  error?: string;
  refreshIntervalMs: number;
  onRefreshIntervalChange: (refreshIntervalMs: number) => void;
  onToggle: () => void;
}

export const LearnLiveCaptionControl: React.FC<LearnLiveCaptionControlProps> = ({
  supported,
  running,
  starting,
  state,
  error,
  refreshIntervalMs,
  onRefreshIntervalChange,
  onToggle,
}) => {
  const statusText = useMemo(() => {
    if (error) {
      return 'Error';
    }
    if (starting) {
      return 'Starting…';
    }
    if (running) {
      return 'On';
    }
    return 'Off';
  }, [error, running, starting]);

  if (!supported) {
    return null;
  }

  return (
    <MiteiruPanel
      variant={running ? 'live' : 'default'}
      label="Live CC"
      headerAction={
        <span className={`text-[11px] font-bold normal-case tracking-normal ${error ? 'text-red-600' : running ? 'text-green-800' : 'text-blue-700'}`}>
          {statusText}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={starting}
          className={running ? UI_ACTION_BTN_LIVE : UI_ACTION_BTN_PRIMARY}
        >
          {running ? 'Stop' : starting ? '…' : 'Start'}
        </button>
        <details className={UI_HINT_TEXT}>
          <summary className="cursor-pointer text-blue-700 hover:text-blue-900">
            Refresh: {refreshIntervalMs < 1000 ? `${refreshIntervalMs}ms` : '1s'}
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {liveCaptionRefreshIntervals.map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => onRefreshIntervalChange(interval)}
                className={[
                  UI_ACTION_BTN,
                  refreshIntervalMs === interval ? '!bg-blue-600 !text-white !border-blue-800' : '',
                ].join(' ')}
              >
                {interval < 1000 ? `${interval}ms` : '1s'}
              </button>
            ))}
            <span className="w-full text-[10px] text-blue-500">state: {state}</span>
          </div>
        </details>
      </div>

      {error && <div className={`mt-2 ${UI_ERROR_BANNER}`}>{error}</div>}
    </MiteiruPanel>
  );
};
