import {isSubtitle, isVideo} from "./fomatUtils";
import {videoConstants} from "./constants";

export const findNextInFolder = (path: string) => {
  let matcher = [];
  if(isVideo(path)) matcher = videoConstants.supportedVideoFormats;
  if(isSubtitle(path)) matcher = videoConstants.supportedSubtitleFormats;

}