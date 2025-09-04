import {useEffect} from 'react';
import {useRouter} from "next/router";
import useLanguageManager from "./useLanguageManager";

export default function useLearningKeyBind(
    setMeaning,
    setShowSidebar,
    undo,
    rubyContent: any = ''
) {
  const router = useRouter();
  const { clearLanguage } = useLanguageManager();
  
  useEffect(() => {
    const handleKeyPress = async (event) => {
      if (event.code === "Escape") {
        setMeaning("");
      } else if (event.code === "KeyQ" && event.ctrlKey) {
        clearLanguage(); // Clear language state when explicitly going home
        await router.push('/home');
      } else if (event.code === "KeyL" && event.ctrlKey) {
        await router.push('/video');
      } else if (event.code === "KeyD" && event.ctrlKey) {
        undo();
      } else if (event.code === "KeyX" && event.ctrlKey) {
        setShowSidebar((old) => {
          return !old;
        });
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
  }, [router, rubyContent, setMeaning, setShowSidebar, undo, clearLanguage]);

}
