import {useCallback, useState} from "react";

const useMeaning = () => {
  const [meaning, _setMeaning] = useState('');
  // Using a linked list for history
  const [history, setHistory] = useState(null);

  const setMeaning = useCallback((newMeaning) => {
    if (newMeaning === '') {
      // Clear the history
      setHistory(null);
      _setMeaning('');
    } else if(newMeaning != meaning) {
      // Update history with the current meaning
      setHistory({ value: meaning, next: history });
      _setMeaning(newMeaning);
    }
  }, [history, meaning])

  const undo = useCallback(() => {
    if (history !== null) {
      _setMeaning(history.value);
      setHistory(history.next);
    } else {
      _setMeaning('');
    }
  }, [history]);

  // The first word's history entry is the empty "no word" state: there is only something to go back
  // to once another word has been opened from inside the popup.
  const canGoBack = history !== null && history.value !== '';

  return { meaning, setMeaning, undo, canGoBack };
};

export default useMeaning;
