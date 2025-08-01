import {useState} from 'react';

const useMenuDisplay = () => {
  const [showController, setShowController] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false)
  const [showLyricsSearch, setShowLyricsSearch] = useState(false);

  return {
    showController,
    setShowController,
    showSidebar,
    setShowSidebar,
    showLyricsSearch,
    setShowLyricsSearch
  }
};

export default useMenuDisplay;
