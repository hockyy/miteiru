import {useEffect} from 'react';
import {
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {useRouter} from "next/router";

export default function useKeyBind(
    setMeaning,
    setShowController,
    setShowSidebar,
    setPrimarySub,
    setSecondarySub,
    primarySub,
    undo,
    setShowPrimarySub,
    setShowSecondarySub,
    primaryStyling,
    setPrimaryStyling,
    openDeepL,
    openGoogleTranslate,
    reloadLastPrimarySubtitle,
    reloadLastSecondarySubtitle,
    setShowVocabSidebar,
    rubyContent,
    contentString
) {
  const router = useRouter();
  useEffect(() => {
    const handleKeyPress = async (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return; // Exit the function early if an input element is focused
      }
      if (event.code === "KeyH") {
        setMeaning("");
        if (event.ctrlKey) await router.push('/home');
      } else if (event.code === "KeyL") {
        if (event.ctrlKey) {
          if (event.shiftKey) {
            await router.push('/learn');
          } else {
            await router.push('/srs');
          }
        }
      } else if (event.code === "KeyK") {
        if (event.ctrlKey) {
          if (event.shiftKey) {
            await router.push('/db');
          } else {
            await router.push('/flash');
          }
        }
      } else if (event.code === "KeyZ") {
        setShowController((old) => {
          return !old;
        });
      } else if (event.code === "KeyX") {
        if (event.ctrlKey) {
          setShowVocabSidebar((old) => {
            return !old;
          })
        } else {
          setShowSidebar((old) => {
            return !old;
          });
        }
      } else if (event.code === "KeyY") {
        const newCopy = JSON.parse(JSON.stringify(primaryStyling))
        newCopy.showFurigana = !primaryStyling.showFurigana;
        setPrimaryStyling(newCopy);
      } else if (event.code === "KeyO") {
        if (event.ctrlKey) {
          setPrimarySub(new SubtitleContainer(''));
          setGlobalSubtitleId(primarySub.id);
        } else {
          setShowPrimarySub(old => !old);
        }
      } else if (event.code === "KeyP") {
        if (event.ctrlKey) {
          setSecondarySub(new SubtitleContainer(''));
        } else {
          setShowSecondarySub(old => !old);
        }
      } else if (event.code === "Escape") {
        undo();
      } else if (event.code === "KeyG") {
        openGoogleTranslate();
      } else if (event.code === "KeyT") {
        openDeepL();
      } else if (event.code === "KeyA") {
        reloadLastSecondarySubtitle();
        reloadLastPrimarySubtitle();
      } else if (event.code === "KeyC") {
        // New copy functionality
        if (event.shiftKey) {
          if (contentString) {
            try {
              await navigator.clipboard.writeText(contentString);
            } catch (err) {
              console.error("Failed to copy text: ", err);
            }
          }
        } else {
          if (rubyContent) {
            try {
              await navigator.clipboard.writeText(rubyContent);
            } catch (err) {
              console.error("Failed to copy text: ", err);
            }
          }

        }

      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [router, setMeaning, setShowController, setShowSidebar, setPrimarySub, setSecondarySub, setPrimaryStyling, primarySub.id, setShowPrimarySub, setShowSecondarySub, undo, primaryStyling, openGoogleTranslate, openDeepL, reloadLastSecondarySubtitle, reloadLastPrimarySubtitle, setShowVocabSidebar, rubyContent, contentString]);

}
