import { useEffect, useState } from 'react';
import Store from 'electron-store';
const store = new Store();

// Use this function to load data when the component is mounted
export const useStoreData = (key, defaultValue) => {
  const [data, setData] = useState(defaultValue);

  useEffect(() => {
    // Load data from the store when the component is mounted
    const storeData = store.get(key, defaultValue);
    setData(storeData);
  }, [key, defaultValue]);

  // This function can be used to update the data in the store
  const setStoreData = (value) => {
    store.set(key, value);
    setData(value);
  };

  return [data, setStoreData];
};
