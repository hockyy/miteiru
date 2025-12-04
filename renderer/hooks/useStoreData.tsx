import { useEffect, useState, useCallback } from 'react';

export const useStoreData = (key, defaultValue) => {
  const [data, setData] = useState(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load data from the store when the component is mounted
    window.electronStore.get(key, defaultValue).then(storeData => {
      setData(storeData);
      setIsLoaded(true);
    }).catch(error => {
      setIsLoaded(true);
    });
  }, [key, defaultValue]);

  // This function can be used to update the data in the store
  const setStoreData = useCallback(async (value) => {
    try {
      await window.electronStore.set(key, value);
      setData(value);
    } catch (error) {
    }
  }, [key]);

  return [data, setStoreData];
};