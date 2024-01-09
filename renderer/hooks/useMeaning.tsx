import { useState } from "react";

const useMeaning = () => {
  const [meaning, _setMeaning] = useState('');
  // Using a linked list for history
  const [history, setHistory] = useState(null);

  const setMeaning = (newMeaning) => {
    if (newMeaning === '') {
      // Clear the history
      setHistory(null);
      _setMeaning('');
    } else if(newMeaning != meaning) {
      // Update history with the current meaning
      setHistory({ value: meaning, next: history });
      _setMeaning(newMeaning);
    }
  };

  const undo = () => {
    if (history !== null) {
      _setMeaning(history.value);
      setHistory(history.next);
    } else {
      _setMeaning('');
    }
  };

  return { meaning, setMeaning, undo };
};

export default useMeaning;
