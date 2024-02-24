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
) {
  const router = useRouter();
  useEffect(() => {
    const handleKeyPress = async (event) => {
      if (event.code === "Escape") {
        setMeaning("");
      } else if (event.code === "KeyQ") {
        await router.push('/home');
      } else if (event.code === "KeyL") {
        await router.push('/learn');
      } else if (event.code === "KeyZ") {
        setShowController((old) => {
          return !old;
        });
      } else if (event.code === "KeyX") {
        setShowSidebar((old) => {
          return !old;
        });
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
      } else if (event.code === "KeyD") {
        undo();
      } else if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [router, setMeaning, setShowController, setShowSidebar, setPrimarySub, setSecondarySub, setPrimaryStyling, primarySub.id, setShowPrimarySub, setShowSecondarySub, undo, primaryStyling]);

}
