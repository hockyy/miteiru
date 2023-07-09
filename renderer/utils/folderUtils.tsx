import {isArrayEndsWithMatcher, isSubtitle, isVideo} from "./utils";
import {videoConstants} from "./constants";
import {readdirSync} from "fs";

export const findPositionDeltaInFolder = (path: string, delta: number = 1) => {
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
  let low = 0;
  let high = filesMatched.length - 1;
  while(low < high) {
    let mid = (low + high + 1) >> 1;
    if(filesMatched[mid] <= path) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  if(filesMatched.length === 0) return '';
  if(filesMatched[low] !== path) {
    if(delta < 0) delta++;
  }
  const nextIndex = low + delta;
  if (0 <= nextIndex && nextIndex < filesMatched.length) {
    return filesMatched[nextIndex];
  }
  return '';
}
