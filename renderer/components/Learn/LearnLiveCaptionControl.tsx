/** Live CC toggle for /learn middle column. Hook: hooks/useLiveCaptions.tsx */
import React, {useMemo} from 'react';
import {liveCaptionRefreshIntervals} from '../../types/liveCaptions';

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
    <div className="rounded-md border border-blue-300 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-blue-900">Live CC</span>
        <span className={`text-xs ${error ? 'text-red-600' : 'text-blue-600'}`}>{statusText}</span>
        <button
          type="button"
          onClick={onToggle}
          disabled={starting}
          className={[
            'ml-auto rounded px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-60',
            running
              ? 'border border-green-500 bg-green-100 text-green-900 hover:bg-green-200'
              : 'border border-blue-400 bg-blue-100 text-blue-900 hover:bg-blue-200',
            error ? 'ring-1 ring-red-300' : '',
          ].join(' ')}
        >
          {running ? 'Stop' : starting ? '…' : 'Start'}
        </button>
        <details className="text-xs text-blue-800">
          <summary className="cursor-pointer text-blue-700 hover:text-blue-900">
            {refreshIntervalMs < 1000 ? `${refreshIntervalMs}ms` : '1s'}
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {liveCaptionRefreshIntervals.map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => onRefreshIntervalChange(interval)}
                className={[
                  'rounded px-1.5 py-0.5 text-xs font-bold transition-colors',
                  refreshIntervalMs === interval
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100',
                ].join(' ')}
              >
                {interval < 1000 ? `${interval}ms` : '1s'}
              </button>
            ))}
            <span className="w-full text-[10px] text-blue-500">state: {state}</span>
          </div>
        </details>
      </div>

      {error && (
        <div className="mt-1.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
          {error}
        </div>
      )}
    </div>
  );
};
