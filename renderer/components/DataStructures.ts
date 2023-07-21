import {getFurigana} from "shunou";
import fs from 'fs';
import {parse as parseSRT} from '@plussub/srt-vtt-parser';
import {parse as parseASS} from 'ass-compiler';
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite"
import {ipcRenderer} from "electron";
import {isHiragana, isKatakana, toHiragana} from 'wanakana'
import {videoConstants} from "../utils/constants";
import {randomUUID} from "crypto";


const languageMap = {
  'japanese': 'JP',
  'english': 'EN',
}

function removeTags(text) {
  const regex = /\{\\.+?}/g;
  return text.replace(regex, '');
}


export class Line {
  timeStart: number;
  timeEnd: number;
  content: any[] | string;
  meaning: string[];

  constructor(start, end, strContent: string) {
    this.timeStart = start
    this.timeEnd = end
    this.content = strContent;
  }

  fillContentFurigana(mecab) {
    this.content = getFurigana(this.content as string, mecab);
  }

  async fillContentWithLearningKotoba() {
    this.meaning = Array(this.content.length).fill('');
    for (let i = 0; i < this.content.length; i++) {
      const word = this.content[i];
      if ((isHiragana(word.origin) || isKatakana(word.origin)) && word.origin.length <= 3) continue;
      await ipcRenderer.invoke('query', word.origin, 2).then(val => {
        let got = 0;
        for (const entry of val) {
          if (got) break;
          try {
            for (const reading of entry.kana) {
              if (toHiragana(reading.text) === word.hiragana) {
                got = 1;
                break;
              }
            }
            // loop all kanji entry
            for (const kanjiEntry of entry.kanji) {
              if (word.origin === kanjiEntry.text) {
                got = 1;
                break;
              }
            }
            if (got) {
              this.meaning[i] = entry.sense[0].gloss[0].text;
              this.meaning[i] = this.meaning[i].replace(/\((.*?)\)/g, '').trim();
              break;
            }
          } catch (ignored) {
            console.log(ignored)
          }
        }
      })
    }
  }
}

let globalSubtitleId = "";

export const setGlobalSubtitleId = (id) => {
  globalSubtitleId = id;
};

export class SubtitleContainer {
  id: string;
  lines: Line[];
  language: string;
  path: string = '';
  progress: string = '';

  constructor(content: string = '') {
    this.id = randomUUID();
    this.lines = []
    if (content === '') return
    this.language = "JP"
    this.lines.push(new Line(0, 1000000, content));
    return
  }

  static async create(filename: string) {
    if (filename === '') return
    const subtitleContainer = new SubtitleContainer();
    subtitleContainer.path = filename;
    let entries;
    const buffer = await fs.promises.readFile(filename)
    const blob = new Blob([buffer]);

    const currentData = await languageEncoding(blob);
    const text = iconv.decode(buffer, currentData.encoding)
    if (filename.endsWith('.ass')) {
      entries = parseAssSubtitle(text);
    } else {
      const data = parseSRT(text);
      entries = data.entries;
    }
    let ans = 0;
    for (let i = 0; i < Math.min(5, entries.length); i++) {
      if (entries[i].text.match(videoConstants.cjkRegex)) {
        ans++;
      }
    }

    subtitleContainer.language = "EN";
    if (ans >= 3) subtitleContainer.language = "JP";
    // try {
    //   subtitleContainer.language = languageMap[currentData.language];
    // } catch (e) {
    //   subtitleContainer.language = "EN";
    // }
    for (const {from, to, text} of entries) {
      // process transcript entry
      subtitleContainer.lines.push(new Line(from, to, removeTags(text)))
    }
    return subtitleContainer
  }

  async adjustJapanese(mecab) {
    for (let i = 0; i < this.lines.length; i++) {
      if (globalSubtitleId !== this.id) return;
      const line = this.lines[i];
      await line.fillContentFurigana(mecab)
      await line.fillContentWithLearningKotoba();
      this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
    }
  }
}

export function getLineByTime(subtitle: SubtitleContainer, shift: number, t: number) {
  t -= shift
  if (!subtitle.lines || subtitle.lines.length === 0) {
    return {
      content: '',
      meaning: []
    };
  }
  let low = 0;
  let high = subtitle.lines.length - 1;
  while (low < high) {
    let mid = (low + high + 1) >> 1;
    if (subtitle.lines[mid].timeStart <= t) low = mid;
    else high = mid - 1;
  }
  if (subtitle.lines[low].timeStart <= t && t <= subtitle.lines[low].timeEnd) {
    return {
      content: subtitle.lines[low].content,
      meaning: subtitle.lines[low].meaning
    };
  } else {
    return {
      content: '',
      meaning: []
    };
  }
}

function parseAssSubtitle(text: string) {
  const parsedASS = parseASS(text);
  // Extract plain-text dialogue lines
  return parsedASS.events.dialogue.map((event, index) => {
    return {
      id: index.toString(),
      from: Math.round(event.Start * 1000),
      to: Math.round(event.End * 1000),
      text: event.Text.combined.replace(/\\N/g, '\n')
    };
  });
}