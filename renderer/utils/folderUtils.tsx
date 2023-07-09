import {isArrayEndsWithMatcher, isSubtitle, isVideo} from "./fomatUtils";
import {videoConstants} from "./constants";
import {readdirSync} from "fs";

export const findNextInFolder = (path: string) => {
  let matcher = [];
  if (isVideo(path)) matcher = videoConstants.supportedVideoFormats;
  if (isSubtitle(path)) matcher = videoConstants.supportedSubtitleFormats;
  const folderPathSplitted = path.split('/');
  folderPathSplitted.pop();
  const folderPath = folderPathSplitted.join('/');
  let listOfMatchingFiles = [];
  for (const currentFormat of matcher) {
    const wildcardMatcher = folderPath;
    let filesMatched = readdirSync(wildcardMatcher);
    filesMatched = filesMatched.filter(filePattern => {
      return isArrayEndsWithMatcher(filePattern, matcher);
    })
    listOfMatchingFiles = listOfMatchingFiles.concat(wildcardMatcher);
  }
  listOfMatchingFiles = listOfMatchingFiles.sort();
  let retIndex = listOfMatchingFiles.indexOf(path);
  if (retIndex === -1 || retIndex + 1 < listOfMatchingFiles.length) {
    return listOfMatchingFiles[retIndex + 1];
  }
  return '';
}
