import { useEffect, useState } from 'react';

export const useStoreData = (key, defaultValue) => {
  const [data, setData] = useState(defaultValue);

  useEffect(() => {
    // Load data from the store when the component is mounted
    window.electronStore.get(key, defaultValue).then(storeData => {
      setData(storeData);
    });
  }, [key, defaultValue]);

  // This function can be used to update the data in the store
  const setStoreData = (value) => {
    window.electronStore.set(key, value);
    setData(value);
  };

  return [data, setStoreData];
};