import {useState} from "react";
import {SubtitleMode} from "../utils/utils";

export const useSubtitleMode = () => {
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>(SubtitleMode.Normal);
  return {subtitleMode, setSubtitleMode};
}
