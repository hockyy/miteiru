import {useEffect} from 'react';
import {useRouter} from "next/router";
import useLanguageManager from "./useLanguageManager";

const isTextEntryTarget = (target: EventTarget | null) => (
    target instanceof HTMLElement
    && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
);

export default function useLearningKeyBind(
    setMeaning,
    setShowSidebar,
    undo,
    rubyContent: any = '',
    setShowVocabSidebar?: (updater: (value: boolean) => boolean) => void,
) {
  const router = useRouter();
  const { clearLanguage } = useLanguageManager();
  
  useEffect(() => {
    const handleKeyPress = async (event) => {
      // Let "x" type and Ctrl+X cut inside text fields instead of toggling sidebars.
      if (event.code === "KeyX" && isTextEntryTarget(event.target)) return;
      if (event.code === "Escape") {
        setMeaning("");
      } else if (event.code === "KeyH" && event.ctrlKey && !event.shiftKey) {
        clearLanguage();
        await router.push('/home');
      } else if (event.code === "KeyL" && event.ctrlKey && !event.shiftKey) {
        await router.push('/video');
      } else if (event.code === "KeyD" && event.ctrlKey) {
        undo();
      } else if (event.code === "KeyX" && event.ctrlKey) {
        if (setShowVocabSidebar) {
          setShowVocabSidebar((old) => !old);
        } else {
          setShowSidebar((old) => !old);
        }
      } else if (event.code === "KeyX" && !event.ctrlKey && setShowVocabSidebar) {
        setShowSidebar((old) => !old);
      } else if (event.code === "KeyG" && event.ctrlKey) {
        if (rubyContent) {
          await navigator.clipboard.writeText(rubyContent);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [router, rubyContent, setMeaning, setShowSidebar, setShowVocabSidebar, undo, clearLanguage]);

}
