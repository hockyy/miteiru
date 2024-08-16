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
export const isYoutube = (url) => {
  // Regular expression to match YouTube URLs.
  // It matches following formats:
  //  - www.youtube.com/watch?v=VIDEO_ID
  //  - m.youtube.com/watch?v=VIDEO_ID
  //  - youtube.com/watch?v=VIDEO_ID
  //  - www.youtube.com/v/VIDEO_ID
  //  - http://youtu.be/VIDEO_ID
  //  - youtube.com/embed/VIDEO_ID
  //  - https://www.youtube.com/shorts/VIDEO_ID
  const pattern = /^(http(s)?:\/\/)?((w){3}.)?youtu(be|.be)?(\.com)?\/(watch|embed|v|shorts)?(\?v=)?(\?embed)?\/?(\S+)?$/;
  return pattern.test(url);
}

export const isDomainUri = (url) => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

export const isLocalPath = (url) => {

  // If it's not a valid URL, it might be a local path
  return !isDomainUri(url);
}


export const isSubtitle = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedSubtitleFormats);
}

export const extractVideoId = (url) => {
  const regex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=)?([^&]+)/;
  const results = regex.exec(url);
  if (!results) {
    return null;
  }
  return results[5];
}

const getFormattedNameFromPath = (path) => {
  const pathList = path.split('/');
  return path ? (' - ' + pathList[pathList.length - 1]) : ''

}

export const getMiteiruVideoTitle = (videoPath = '', primarySub = '', secondarySub = '', showPrimarySub: boolean, showSecondarySub: boolean) => {
  let tmpTitle = `Miteiru${getFormattedNameFromPath(videoPath)}${getFormattedNameFromPath(primarySub)}${getFormattedNameFromPath(secondarySub)}`
  tmpTitle += `-CJK${showPrimarySub ? '✅' : '❌'}-Other${showSecondarySub ? '✅' : '❌'}`
  return tmpTitle
}

export const toTime = (time: number) => {
  time = Math.trunc(time)
  const seconds = time % 60;
  time -= seconds;
  time /= 60;
  const minutes = time % 60;
  time -= minutes;
  time /= 60;
  const hours = time;

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

export const adjustTimeWithShift = (currentTime: number, shift: number) => {
  return Math.trunc(currentTime * 1000) - shift
}


export const sortAndFilterTopXPercentToJson = (frequency, x: number) => {
  const sortedArray = Array.from(frequency.entries())
  .sort((a, b) => b[1] - a[1]);

  const limitIndex = Math.ceil((x / 100) * sortedArray.length);
  const topXPercentArray = sortedArray.slice(0, limitIndex);

  const filteredArray = topXPercentArray.filter(entry => entry[1] > 1);

  return filteredArray.reduce((obj, [key, value]) => {
    obj[key] = value;
    return obj;
  }, {});
}


export const getRelativeTime = (timestamp) => {
  const now = new Date().getTime();
  const updatedDate = new Date(timestamp).getTime();
  const diffTime = Math.abs(now - updatedDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};
export const getColorGradient = (timestamp) => {
  const now = new Date().getTime();
  const diff = now - timestamp;
  const maxDiff = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  const ratio = Math.min(diff / maxDiff, 1);

  // Pastel green (newest) to pastel red (oldest)
  const red = Math.round(255 * (0.5 + ratio * 0.5));
  const green = Math.round(255 * (1 - ratio * 0.5));
  const blue = Math.round(255 * (0.5 + Math.abs(ratio - 0.5) * 0.5));

  return `rgb(${red}, ${green}, ${blue})`;
};