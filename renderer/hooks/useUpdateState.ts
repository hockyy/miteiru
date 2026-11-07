import {useSyncExternalStore} from 'react';
import {getUpdateState, subscribeToUpdates} from '../platform/updates';

/** The app-wide update state (renderer/platform/updates.ts). */
export const useUpdateState = () => useSyncExternalStore(subscribeToUpdates, getUpdateState, getUpdateState);
