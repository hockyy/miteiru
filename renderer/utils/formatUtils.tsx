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

const getFormattedNameFromPath = (path) => {
  const pathList = path.split('/');
  return path ? (' - ' + pathList[pathList.length - 1]) : ''

}
export const getMiteiruVideoTitle = (videoPath = '', primarySub = '', secondarySub = '') => {
  return `Miteiru${getFormattedNameFromPath(videoPath)}${getFormattedNameFromPath(primarySub)}${getFormattedNameFromPath(secondarySub)}`
}
