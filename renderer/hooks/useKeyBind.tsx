import {useEffect} from 'react';
import {SubtitleContainer} from "../components/DataStructures";

export default function useKeyBind(
    router,
    setMeaning,
    setShowController,
    setShowSidebar,
    setPrimarySub,
    setSecondarySub,
    mecab
) {

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.code === "Escape") {
        setMeaning("");
      } else if (event.code === "KeyQ") {
        router.push('/home');
      } else if (event.code === "KeyL") {
        router.push('/learn');
      } else if (event.code === "KeyZ") {
        setShowController((old) => {
          return !old;
        });
      } else if (event.code === "KeyX") {
        setShowSidebar((old) => {
          return !old;
        });
      } else if (event.code === "KeyO") {
        setPrimarySub(new SubtitleContainer('', mecab));
      } else if (event.code === "KeyP") {
        setSecondarySub(new SubtitleContainer('', mecab));
      } else if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [router, setMeaning, setShowController, setShowSidebar, setPrimarySub, setSecondarySub]);

}
