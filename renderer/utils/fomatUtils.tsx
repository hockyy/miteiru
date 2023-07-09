import {videoConstants} from "./constants";

export const isArrayEndsWithMatcher = (path, arrayMatcher) => {
  for (const videoFormat of arrayMatcher) {
    if (path.endsWith('.' + videoFormat)) {
      return true
    }
  }
  return false;
}

export const isVideo = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedVideoFormats);
}

export const isSubtitle = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedSubtitleFormats);
}

