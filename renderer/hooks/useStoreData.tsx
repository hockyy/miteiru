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

export const useStoreData = (key, defaultValue) => {
  const [data, setData] = useState(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    window.electronStore.get(key, defaultValueRef.current).then(storeData => {
      setData(storeData);
      setIsLoaded(true);
    }).catch(() => {
      setIsLoaded(true);
    });
  }, [key]);

  // Sync when another component updates the same store key (e.g. API key in sidebar).
  useEffect(() => subscribeStoreKey(key, setData), [key]);

  const setStoreData = useCallback(async (value) => {
    try {
      await window.electronStore.set(key, value);
      setData(value);
      publishStoreKey(key, value);
    } catch (error) {
    }
  }, [key]);

  return [data, setStoreData, isLoaded];
};
