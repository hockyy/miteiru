import { useCallback, useState } from 'react';

interface CacheResult {
  ok: number;
  message: string;
}

const mecabDefaultDirectory = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': 'C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe'
};

const removingCacheMessage: CacheResult = {
  ok: 2,
  message: 'Removing Caches '
};

export const useCacheManager = () => {
  const [mecab, setMecab] = useState(
    mecabDefaultDirectory[process.platform] ?? mecabDefaultDirectory['linux']
  );
  const [isRemovingCache, setIsRemovingCache] = useState(false);

  const handleSelectMecabPath = useCallback(() => {
    window.ipc.invoke('pickFile', ['*']).then((val) => {
      if (!val.canceled) setMecab(val.filePaths[0]);
    });
  }, []);

  const handleRemoveCache = useCallback(async () => {
    if (isRemovingCache) {
      console.log('[Cache] Cache removal already in progress, ignoring request');
      return { ok: 2, message: 'Cache removal in progress...' };
    }

    setIsRemovingCache(true);
    
    try {
      const result = await window.ipc.invoke('removeDictCache');
      return {
        ok: 0,
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
