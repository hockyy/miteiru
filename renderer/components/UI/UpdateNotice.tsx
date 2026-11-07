import React, {useEffect, useState} from 'react';
import {Button} from '../Utils/Button';
import {useUpdateState} from '../../hooks/useUpdateState';
import {checkForUpdate, installUpdate, RELEASES_URL, UPDATE_SETTING_KEY} from '../../platform/updates';

/** How long after start-up the first check waits, so it never competes with opening a video. */
const FIRST_CHECK_DELAY_MS = 8000;

/**
 * Checks for an update once after start-up (unless turned off in Settings & tools) and offers it
 * in a small card. A failed check stays quiet here; the settings panel shows it.
 */
export const UpdateNotice = () => {
  const state = useUpdateState();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const enabled = await Promise.resolve(window.electronStore?.get(UPDATE_SETTING_KEY, true)).catch(() => true);
      if (!cancelled && enabled !== false) await checkForUpdate();
    }, FIRST_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const installFailed = state.kind === 'error' && state.version;
  if (dismissed || !(state.kind === 'available' || state.kind === 'downloading' || state.kind === 'installing' || installFailed)) {
    return null;
  }

  return (
    <div role="status"
         className="fixed bottom-4 right-4 z-[100] w-72 rounded-2xl border-2 border-blue-300 bg-white/95 p-3 text-sm text-blue-900 shadow-lg">
      {state.kind === 'available' && (
        <>
          <div className="font-bold">Miteiru {state.version} is here</div>
          <p className="mt-1 text-[12px] text-blue-800">It installs and restarts Miteiru. Your settings and progress stay.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="small" onPress={() => installUpdate()}>Restart to update</Button>
            <Button type="secondary" size="small" onPress={() => setDismissed(true)}>Later</Button>
          </div>
        </>
      )}
      {state.kind === 'downloading' && (
        <div className="font-bold">
          Downloading Miteiru {state.version}{state.percent === null ? '…' : ` · ${state.percent}%`}
        </div>
      )}
      {state.kind === 'installing' && (
        <div className="font-bold">Installing Miteiru {state.version}. It restarts by itself.</div>
      )}
      {installFailed && (
        <>
          <div className="font-bold">The update didn&apos;t install</div>
          <p className="mt-1 break-words text-[12px] text-blue-800">{state.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="small" onPress={() => window.electronAPI?.openExternal?.(RELEASES_URL)}>Get it from GitHub</Button>
            <Button type="secondary" size="small" onPress={() => setDismissed(true)}>Close</Button>
          </div>
        </>
      )}
    </div>
  );
};
