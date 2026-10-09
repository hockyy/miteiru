import { useEffect, useState, useCallback, useRef } from 'react';

const storeListeners = new Map<string, Set<(value: unknown) => void>>();

function subscribeStoreKey(key: string, listener: (value: unknown) => void) {
  if (!storeListeners.has(key)) {
    storeListeners.set(key, new Set());
  }
  storeListeners.get(key)!.add(listener);
  return () => {
    storeListeners.get(key)?.delete(listener);
  };
}

function publishStoreKey(key: string, value: unknown) {
  storeListeners.get(key)?.forEach((listener) => listener(value));
}

/**
 * A value kept in the settings store under `key`. `migrate`, if given, updates a stored value from an
 * older format as it is read (the store keeps the old one until the value is next saved).
 */
export const useStoreData = <T,>(
  key: string,
  defaultValue: T,
  migrate?: (stored: T) => T
): [T, (value: T) => Promise<void>, boolean] => {
  const [data, setData] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const defaultValueRef = useRef<T>(defaultValue);
  defaultValueRef.current = defaultValue;
  const migrateRef = useRef(migrate);
  migrateRef.current = migrate;

  useEffect(() => {
    let cancelled = false;

    window.electronStore.get(key, defaultValueRef.current).then((storeData) => {
      if (cancelled) {
        return;
      }
      setData(() => (migrateRef.current ? migrateRef.current(storeData as T) : storeData as T));
      setIsLoaded(true);
    }).catch(() => {
      if (!cancelled) {
        setIsLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  // Sync when another component updates the same store key (e.g. API key in sidebar).
  useEffect(() => subscribeStoreKey(key, (value) => {
    setData(() => value as T);
  }), [key]);

  const setStoreData = useCallback(async (value: T) => {
    try {
      await window.electronStore.set(key, value);
      setData(() => value);
      publishStoreKey(key, value);
    } catch (error) {
      console.error(`Failed to save setting "${key}":`, error);
    }
  }, [key]);

  return [data, setStoreData, isLoaded];
};
