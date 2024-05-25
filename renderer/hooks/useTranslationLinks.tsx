import {useCallback} from 'react';

const useTranslationLinks = (inputText: string) => {
  const openDeepL = useCallback(() => {
    const url = `https://www.deepl.com/translator#zh/en/${encodeURIComponent(inputText)}`;
    window.open(url, '_blank');
  }, [inputText]);

  const openGoogleTranslate = useCallback(() => {
    const url = `https://translate.google.com/?sl=zh-CN&tl=en&text=${encodeURIComponent(inputText)}&op=translate`;
    window.open(url, '_blank');
  }, [inputText]);

  return {
    openDeepL,
    openGoogleTranslate
  };
};

export default useTranslationLinks;
