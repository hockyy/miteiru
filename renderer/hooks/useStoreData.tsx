import { useEffect, useState } from 'react';
import {useMiteiruApi} from "./useMiteiruApi";

// Use this function to load data when the component is mounted
export const useStoreData = (key, defaultValue) => {
  const [data, setData] = useState(defaultValue);
  const {miteiruApi} = useMiteiruApi();

  useEffect(() => {
    // Load data from the store when the component is mounted
    const storeData = miteiruApi.storeGet(key, defaultValue);
    setData(storeData);
  }, [key, defaultValue]);

  // This function can be used to update the data in the store
  const setStoreData = (value) => {
    miteiruApi.storeSet(key, value);
    setData(value);
  };

  return [data, setStoreData];
};
