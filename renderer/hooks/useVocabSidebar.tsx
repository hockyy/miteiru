// hooks/useVocabSidebar.js
import { useState, useCallback } from 'react';

const useVocabSidebar = () => {
  const [showVocabSidebar, setShowVocabSidebar] = useState(false);

  const toggleVocabSidebar = useCallback(() => {
    setShowVocabSidebar(prev => !prev);
  }, []);

  return {
    showVocabSidebar,
    setShowVocabSidebar,
    toggleVocabSidebar
  };
};

export default useVocabSidebar;