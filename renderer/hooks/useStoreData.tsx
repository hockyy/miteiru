import { useEffect, useState, useCallback } from 'react';

export const useStoreData = (key, defaultValue) => {
  const [data, setData] = useState(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load data from the store when the component is mounted
    window.electronStore.get(key, defaultValue).then(storeData => {
      console.log(`useStoreData: Loaded ${key} =`, storeData);
      setData(storeData);
      setIsLoaded(true);
    }).catch(error => {
      console.error(`useStoreData: Failed to load ${key}`, error);
      setIsLoaded(true);
    });
  }, [key, defaultValue]);

  // This function can be used to update the data in the store
  const setStoreData = useCallback(async (value) => {
    console.log(`useStoreData: Setting ${key} =`, value);
    try {
      await window.electronStore.set(key, value);
      console.log(`useStoreData: Successfully saved ${key}`);
      setData(value);
    } catch (error) {
      console.error(`useStoreData: Failed to save ${key}`, error);
    }
  }, [key]);

  return [data, setStoreData];
};