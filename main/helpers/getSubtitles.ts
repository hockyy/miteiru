/* @flow */

import axios from 'axios';
import {find} from 'lodash';
import {decode} from 'html-entities';

function stripTags(input, allowedTags = [], replacement = '') {
  // Create a string of allowed tags, joined by '|'
  let tags = allowedTags.join('|');

  // Create a new RegExp object
  let regex = new RegExp(`<(?!\/?(${tags})[^>]*)\/?.*?>`, 'g');

  // Replace disallowed tags with replacement string
  return input.replace(regex, replacement);
}

export async function getSubtitles({videoID, lang = 'ja'}) {
  const {data} = await axios.get(
      `https://youtube.com/watch?v=${videoID}`
  );

  // * ensure we have access to captions data
  if (!data.includes('captionTracks'))
    throw new Error(`Could not find captions for video: ${videoID}`);

  const regex = /({"captionTracks":.*isTranslatable":(true|false)}])/;
  const [match] = regex.exec(data);
  const {captionTracks} = JSON.parse(`${match}}`);
  console.log(captionTracks)

  const subtitle =
      find(captionTracks, {
        vssId: `.${lang}`,
      }) ||
      find(captionTracks, {
        vssId: `a.${lang}`,
      }) ||
      find(captionTracks, ({vssId}) => vssId && vssId.match(`.${lang}`));

  // * ensure we have found the correct subtitle lang
  if (!subtitle || (subtitle && !subtitle.baseUrl))
    throw new Error(`Could not find ${lang} captions for ${videoID}`);

  const {data: transcript} = await axios.get(subtitle.baseUrl);
  return transcript
  .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
  .replace('</transcript>', '')
  .split('</text>')
  .filter(line => line && line.trim())
  .map(line => {
    const startRegex = /start="([\d.]+)"/;
    const durRegex = /dur="([\d.]+)"/;

    const [, start] = startRegex.exec(line);
    const [, dur] = durRegex.exec(line);

    const htmlText = line
    .replace(/<text.+>/, '')
    .replace(/&amp;/gi, '&')
    .replace(/<\/?[^>]+(>|$)/g, '');
    const decodedText = decode(htmlText);
    const text = stripTags(decodedText);

    return {
      start,
      dur,
      text,
    };
  });
}