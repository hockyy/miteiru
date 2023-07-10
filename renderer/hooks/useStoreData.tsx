import { useEffect, useState } from 'react';

// Use this function to load data when the component is mounted
export const useStoreData = (miteiruApi, key, defaultValue) => {
  const [data, setData] = useState(defaultValue);
  useEffect(() => {
    if(!miteiruApi) return;
    // Load data from the store when the component is mounted
    const storeData = miteiruApi.storeGet(key, defaultValue);
    setData(storeData);
  }, [key, defaultValue, miteiruApi]);

  // This function can be used to update the data in the store
  const setStoreData = (value) => {
    miteiruApi.storeSet(key, value);
    setData(value);
  };

  return [data, setStoreData];
};
