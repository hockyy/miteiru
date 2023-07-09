import {useState} from 'react';

const useLoadFiles = () => {
  const [showController, setShowController] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false)
  return {
    showController, setShowController, showSidebar, setShowSidebar
  }
};

export default useLoadFiles;
