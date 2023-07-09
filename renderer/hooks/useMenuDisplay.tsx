import {useState} from 'react';

const useMenuDisplay = () => {
  const [showController, setShowController] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false)
  return {
    showController, setShowController, showSidebar, setShowSidebar
  }
};

export default useMenuDisplay;
