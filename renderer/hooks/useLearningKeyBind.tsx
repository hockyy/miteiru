import {useEffect} from 'react';
import {useRouter} from "next/router";
import {isTextEntryTarget} from "../utils/keyboardTargets";
import {hasCtrlModifier} from "../utils/platform";

export default function useLearningKeyBind(
    setMeaning,
    setShowSidebar,
    undo,
    rubyContent: any = '',
    setShowVocabSidebar?: (updater: (value: boolean) => boolean) => void,
) {
  const router = useRouter();
  
  useEffect(() => {
    const handleKeyPress = async (event) => {
      const ctrl = hasCtrlModifier(event);
      // Let "x" type and Ctrl+X cut inside text fields instead of toggling sidebars.
      if (event.code === "KeyX" && isTextEntryTarget(event.target)) return;
      if (event.code === "Escape") {
        setMeaning("");
      } else if (event.code === "KeyH" && ctrl && !event.shiftKey) {
        // Home keeps the language in use selected (it is the remembered "last used" one).
        await router.push('/home');
      } else if (event.code === "KeyL" && ctrl && !event.shiftKey) {
        await router.push('/video?continue=1');
      } else if (event.code === "KeyD" && ctrl) {
        undo();
      } else if (event.code === "KeyX" && ctrl) {
        if (setShowVocabSidebar) {
          setShowVocabSidebar((old) => !old);
        } else {
          setShowSidebar((old) => !old);
        }
      } else if (event.code === "KeyX" && !ctrl && setShowVocabSidebar) {
        setShowSidebar((old) => !old);
      } else if (event.code === "KeyG" && ctrl) {
        if (rubyContent) {
          await navigator.clipboard.writeText(rubyContent);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [router, rubyContent, setMeaning, setShowSidebar, setShowVocabSidebar, undo]);

}
