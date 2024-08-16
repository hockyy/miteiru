import {useCallback} from 'react';

const useTranslationLinks = (content: string, lang: string) => {
  const openDeepL = useCallback(() => {
    const url = `https://www.deepl.com/translator#zh/en/${encodeURIComponent(content)}`;
    window.electronAPI.openExternal(url);
  }, [content]);

  const openGoogleTranslate = useCallback(() => {
    const url = `https://translate.google.com/?sl=${lang}&tl=en&text=${encodeURIComponent(content)}&op=translate`;
    window.electronAPI.openExternal(url);
  }, [content, lang]);

  return {
    openDeepL,
    openGoogleTranslate
  };
};

export default useTranslationLinks;