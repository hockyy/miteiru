import {useCallback, useMemo, useState} from 'react';

const useContentString = () => {
  const [externalContent, setExternalContent] = useState<any[]>([]);

  const generateContentString = useCallback((content: string | any[]) => {
    if (typeof content === 'string') {
      return content;
    }
    return content.map(val => val.origin).join('');
  }, []);

  const contentString = useMemo(() => generateContentString(externalContent), [externalContent, generateContentString]);

  return {contentString, externalContent, setExternalContent};
};

export default useContentString;
