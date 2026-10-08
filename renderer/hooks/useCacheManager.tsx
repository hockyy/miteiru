import { useCallback, useState } from 'react';
import { useStoreData } from './useStoreData';
import { defaultMecabPath, MECAB_PATH_STORE_KEY } from '../utils/mecabPath';

interface CacheResult {
  ok: number;
  message: string;
}

const removingCacheMessage: CacheResult = {
  ok: 2,
  message: 'Removing Caches '
};

export const useCacheManager = () => {
  // Persisted so language loading (including auto-load) can send it to main.
  const [mecab, setMecab] = useStoreData(MECAB_PATH_STORE_KEY, defaultMecabPath());
  const [isRemovingCache, setIsRemovingCache] = useState(false);

  const handleSelectMecabPath = useCallback(() => {
    window.ipc.invoke('pickFile', ['*']).then((val) => {
      if (!val.canceled) setMecab(val.filePaths[0]);
    });
  }, [setMecab]);

  const handleRemoveCache = useCallback(async () => {
    if (isRemovingCache) {
      console.log('[Cache] Cache removal already in progress, ignoring request');
      return { ok: 2, message: 'Cache removal in progress...' };
    }

    setIsRemovingCache(true);
    
    try {
      const result = await window.ipc.invoke('removeDictCache');
      return {
        ok: 1,
        message: result
      };
    } catch (error) {
      return {
        ok: 0,
        message: `Error removing cache: ${error.message}`
      };
    } finally {
      setIsRemovingCache(false);
    }
  }, [isRemovingCache]);

  return {
    mecab,
    setMecab,
    isRemovingCache,
    handleSelectMecabPath,
    handleRemoveCache
  };
};
