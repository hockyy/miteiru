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

export const useStoreData = <T,>(key: string, defaultValue: T): [T, (value: T) => Promise<void>, boolean] => {
  const [data, setData] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const defaultValueRef = useRef<T>(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    let cancelled = false;

    window.electronStore.get(key, defaultValueRef.current).then((storeData) => {
      if (cancelled) {
        return;
      }
      setData(() => storeData as T);
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
    }
  }, [key]);

  return [data, setStoreData, isLoaded];
};
