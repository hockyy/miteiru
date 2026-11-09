import {useEffect, useState} from 'react';
import {videoConstants} from '../utils/constants';
import {loadMandarinHsk, type HskWords} from '../utils/mandarinHsk';

export const useMandarinHsk = (lang: string, enabled: boolean, load = loadMandarinHsk): HskWords | null => {
  const active = lang === videoConstants.chineseLang && enabled;
  const [words, setWords] = useState<HskWords | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void load().then((data) => {if (!cancelled) setWords(data);});
    return () => {cancelled = true;};
  }, [active, load]);
  return active ? words : null;
};
