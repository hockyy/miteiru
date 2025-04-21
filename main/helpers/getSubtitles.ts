import axios from 'axios';
import {find} from 'lodash';
import {decode} from 'html-entities';
import {videoConstants} from "../../renderer/utils/constants";

interface SubtitleEntry {
  start: string;
  dur: string;
  text: string;
}

function stripTags(input: string, allowedTags: string[] = [], replacement: string = ''): string {
  const tags = allowedTags.join('|');
  const regex = new RegExp(`<(?!\/?(${tags})[^>]*)\/?.*?>`, 'g');
  return input.replace(regex, replacement);
}

function extractCaptionTracks(data: string): any[] {
  const regex = /"captionTracks":(\[.*?\])/;
  const match = regex.exec(data);
  if (!match) throw new Error("Could not find caption tracks data");
  return JSON.parse(`{${match[0]}}`).captionTracks;
}

function findSubtitle(captionTracks: any[], lang: string): any {
  return find(captionTracks, {vssId: `.${lang}`}) ||
      find(captionTracks, {vssId: `a.${lang}`}) ||
      find(captionTracks, ({vssId}) => vssId && vssId.match(`.${lang}`));
}

function parseTranscriptLine(line: string): SubtitleEntry {
  const startRegex = /start="([\d.]+)"/;
  const durRegex = /dur="([\d.]+)"/;

  const start = startRegex.exec(line)?.[1] || '0.00';
  const dur = durRegex.exec(line)?.[1] || '0.00';

  let text = '';
  try {
    const htmlText = line
    .replace(/<text.+>/, '')
    .replace(/&amp;/gi, '&')
    .replace(/<\/?[^>]+(>|$)/g, '');
    const decodedText = decode(htmlText || '');
    text = stripTags(decodedText);
  } catch (e) {
    console.error('Error processing text:', e);
  }

  return {start, dur, text};
}

export async function getSubtitles({
                                     videoID,
                                     lang = videoConstants.japaneseLang
                                   }): Promise<SubtitleEntry[]> {
  try {
    const {data} = await axios.get(`https://youtube.com/watch?v=${videoID}`);
    console.log(data)
    if (!data.includes('captionTracks')) {
      throw new Error(`Could not find captions for video: ${videoID}`);
    }

    const captionTracks = extractCaptionTracks(data);
    const subtitle = findSubtitle(captionTracks, lang);

    if (!subtitle || !subtitle.baseUrl) {
      throw new Error(`Could not find ${lang} captions for ${videoID}`);
    }

    const {data: transcript} = await axios.get(subtitle.baseUrl);

    return transcript
    .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
    .replace('</transcript>', '')
    .split('</text>')
    .map(parseTranscriptLine);

  } catch (error) {
    console.error('Error fetching subtitles:', error);
    throw error;
  }
}