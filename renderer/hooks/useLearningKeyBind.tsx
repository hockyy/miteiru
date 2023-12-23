import {useEffect} from 'react';
import {
  setGlobalSubtitleId,
  SubtitleContainer
} from "../components/Subtitle/DataStructures";
import {useRouter} from "next/router";

export default function useLearningKeyBind(
    setMeaning,
    setShowSidebar,
) {
  const router = useRouter();
  useEffect(() => {
    const handleKeyPress = async (event) => {
      if (event.code === "Escape") {
        setMeaning("");
      } else if (event.code === "KeyQ") {
        await router.push('/home');
      } else if (event.code === "KeyL") {
        await router.push('/video');
      } else if (event.code === "KeyX") {
        setShowSidebar((old) => {
          return !old;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [router, setMeaning, setShowSidebar]);

}
