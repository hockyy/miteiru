import {useCallback} from 'react';
import {shell} from 'electron';

const useTranslationLinks = (content: string) => {

  const openDeepL = useCallback(() => {
    const url = `https://www.deepl.com/translator#zh/en/${encodeURIComponent(content)}`;
    shell.openExternal(url);
  }, [content]);

  const openGoogleTranslate = useCallback(() => {
    const url = `https://translate.google.com/?sl=zh-CN&tl=en&text=${encodeURIComponent(content)}&op=translate`;
    shell.openExternal(url);
  }, [content]);

  return {
    openDeepL,
    openGoogleTranslate
  };
};

export default useTranslationLinks;
