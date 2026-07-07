import { useCallback, useEffect } from 'react';

/**
 * W / Shift+W copy shortcuts while the meaning box is open.
 * Ignores key events when focus is inside an input or textarea.
 */
export const useMeaningCopyShortcuts = (
  isOpen: boolean,
  meaning: string,
  rubyHtmlContent: string,
) => {
  const copyWord = useCallback(async () => {
    if (!meaning) {
      return;
    }
    try {
      await navigator.clipboard.writeText(meaning);
    } catch (error) {
      console.error('Failed to copy word:', error);
    }
  }, [meaning]);

  const copyRuby = useCallback(async () => {
    if (!rubyHtmlContent) {
      return;
    }
    try {
      await navigator.clipboard.writeText(rubyHtmlContent);
    } catch (error) {
      console.error('Failed to copy ruby content:', error);
    }
  }, [rubyHtmlContent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (event.code === 'KeyW' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        copyWord();
      } else if (event.code === 'KeyW' && event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        copyRuby();
      }
    };

    if (!isOpen) {
      return;
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyRuby, copyWord, isOpen]);

  return { copyWord, copyRuby };
};
