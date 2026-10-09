import { useCallback, useState } from 'react';

export const useCacheManager = () => {
  const [isRemovingCache, setIsRemovingCache] = useState(false);

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
    isRemovingCache,
    handleRemoveCache
  };
};
