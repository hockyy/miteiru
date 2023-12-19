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

  const regex =  /"captionTracks":(\[.*?\])/;
  const [match] = regex.exec(data);
  const { captionTracks } = JSON.parse(`{${match}}`);
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
  .map(line => {
    const startRegex = /start="([\d.]+)"/;
    const durRegex = /dur="([\d.]+)"/;
    let start = '0.00'
    let dur = '0.00'
    try {
      start = startRegex.exec(line)[1];
      dur = durRegex.exec(line)[1];
    } catch (e) {
    }

    let text = ''
    try {
      let htmlText = line
      .replace(/<text.+>/, '')
      .replace(/&amp;/gi, '&')
      .replace(/<\/?[^>]+(>|$)/g, '');
      if (!htmlText) htmlText = ''
      const decodedText = decode(htmlText);
      text = stripTags(decodedText);
    } catch (e) {
    }

    return {
      start,
      dur,
      text,
    };
  });
}