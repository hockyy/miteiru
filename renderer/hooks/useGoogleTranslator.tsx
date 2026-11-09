import {useCallback} from 'react';

const useGoogleTranslator = () => {
  const translate = useCallback((text: string, lang: string) => {
    return window.miteiru.googleTranslate(text, lang);
  }, []);


  return {
    translate
  };
};

export default useGoogleTranslator;