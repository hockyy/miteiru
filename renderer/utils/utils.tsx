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


export const toTime = (time: number) => {
  time = Math.trunc(time)
  let seconds = time % 60;
  time -= seconds;
  time /= 60;
  let minutes = time % 60;
  time -= minutes;
  time /= 60;
  let hours = time;

  return `${hours > 0 ? (hours + ':') : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const joinString = (arr, separator = '; ') => {
  let total = "";
  arr.forEach(val => {
    if (total !== '') total += separator
    total += val.toString();
  })
  return total;
}