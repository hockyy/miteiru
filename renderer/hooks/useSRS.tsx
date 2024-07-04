import { useState, useCallback, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import { videoConstants } from '../utils/constants';

const useSRS = (initialCharacter = '') => {
  const [currentCharacter, setCurrentCharacter] = useState(initialCharacter);
  const [hanziProgress, setHanziProgress] = useState(null);
  const [mode, setMode] = useState('help');

  const fetchProgress = useCallback(async (char) => {
    const progress = await ipcRenderer.invoke('loadSRSState', videoConstants.chineseLang);
    setHanziProgress(progress[char] || {
      level: {reading: 0, meaning: 0, writing: 0},
      timeCreated: Date.now(),
      timeUpdated: {reading: Date.now(), meaning: Date.now(), writing: Date.now()}
    });
  }, []);

  const updateProgress = useCallback(async (char) => {
    await ipcRenderer.invoke('updateSRSContent', char, 'chinese', {
      level: {reading: 0, meaning: 0, writing: 0},
      timeCreated: Date.now(),
      timeUpdated: {reading: Date.now(), meaning: Date.now(), writing: Date.now()}
    });
  }, []);

  useEffect(() => {
    if (currentCharacter) {
      fetchProgress(currentCharacter);
    }
  }, [currentCharacter, fetchProgress]);

  return {
    currentCharacter,
    setCurrentCharacter,
    hanziProgress,
    mode,
    setMode,
    updateProgress
  };
};

export default useSRS;
