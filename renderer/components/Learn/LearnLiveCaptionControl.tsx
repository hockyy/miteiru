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
      return 'Live CC error';
    }
    if (starting) {
      return 'Starting live CC...';
    }
    if (running) {
      return 'Live CC on — captions flow into Current Sentence';
    }
    return 'Live CC off';
  }, [error, running, starting]);

  if (!supported) {
    return null;
  }

  return (
    <div className="rounded-lg border-2 border-blue-300 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-blue-900">Live Captions</h3>
          <p className="text-xs text-blue-700 mt-0.5">{statusText}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={starting}
          className={[
            'rounded-lg border-2 px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60',
            running
              ? 'border-green-500 bg-green-100 text-green-900 hover:bg-green-200'
              : 'border-blue-400 bg-blue-100 text-blue-900 hover:bg-blue-200',
            error ? 'ring-2 ring-red-300' : '',
          ].join(' ')}
        >
          {running ? 'Stop Live CC' : starting ? 'Starting...' : 'Start Live CC'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <details className="text-xs text-blue-800">
        <summary className="cursor-pointer font-semibold text-blue-900">
          Refresh settings (state: {state})
        </summary>
        <div className="mt-2 flex flex-wrap gap-1">
          {liveCaptionRefreshIntervals.map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() => onRefreshIntervalChange(interval)}
              className={[
                'rounded-md px-2 py-1 font-bold transition-colors',
                refreshIntervalMs === interval
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200',
              ].join(' ')}
            >
              {interval < 1000 ? `${interval}ms` : '1s'}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
};
