import {isArrayEndsWithMatcher, isSubtitle, isVideo} from "./formatUtils";
import {videoConstants} from "./constants";
import {readdirSync} from "fs";

export const findNextInFolder = (path: string) => {
  let matcher = [];
  if (isVideo(path)) matcher = videoConstants.supportedVideoFormats;
  if (isSubtitle(path)) matcher = videoConstants.supportedSubtitleFormats;
  const folderPathSplitted = path.split('/');
  folderPathSplitted.pop();
  const folderPath = folderPathSplitted.join('/');
  let filesMatched = readdirSync(folderPath).map(fileName => {
    return `${folderPath}/${fileName}`
  });
  filesMatched = filesMatched.filter(filePattern => {
    return isArrayEndsWithMatcher(filePattern, matcher);
  })
  filesMatched = filesMatched.sort();
  let retIndex = filesMatched.findIndex((element) => {
    return element === path
  });

  if (retIndex + 1 < filesMatched.length) {
    return filesMatched[retIndex + 1];
  }
  return '';
}
