import fs from 'fs';
import {parse as parseSRT} from '@plussub/srt-vtt-parser';
import {parse as parseASS} from 'ass-compiler';
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite"
import {ipcRenderer} from "electron";
import {isHiragana, isKatakana, toHiragana} from 'wanakana'
import {videoConstants} from "../../utils/constants";
import {randomUUID} from "crypto";
import {Entry} from "@plussub/srt-vtt-parser/dist/src/types";
import * as OpenCC from 'opencc-js';

function removeTags(text) {
  const regex = /\{\\.+?}/g;
  return text.replace(regex, '');
}

const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
const noChanger = (text: string) => {return text};

function preProcess(text, accentChanger = noChanger) {
  const removedTag = removeTags(text);
  return accentChanger(removedTag);
}

export class Line {
  timeStart: number;
  timeEnd: number;
  content: any[] | string;
  meaning: string[];
  static removeHearingImpairedFlag: boolean;

  constructor(start, end, strContent: string) {
    this.timeStart = start
    this.timeEnd = end
    if (Line.removeHearingImpairedFlag) {
      this.content = cleanHearingImpaired(strContent)
    } else {
      this.content = strContent;
    }
  }

  async fillContentSeparations(tokenizeMiteiru: (string) => Promise<any[]>) {
    this.content = await tokenizeMiteiru((this.content as string).replace(/\n/g, " "));
  }

  async fillContentWithLearningKotoba(frequency) {
    this.meaning = Array(this.content.length).fill('');
    for (let i = 0; i < this.content.length; i++) {
      const word = this.content[i];
      const target = word.basicForm;
      frequency.set(target, (frequency.get(target) ?? 0) + 1);
      if ((isHiragana(target) || isKatakana(target)) && target.length <= 3) continue;
      await ipcRenderer.invoke('queryJapanese', target, 2).then(val => {
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
              if (target === kanjiEntry.text) {
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
            console.error(ignored)
          }
        }
      })
    }
  }

  async fillContentWithLearningChinese(frequency) {
    this.meaning = Array(this.content.length).fill('');
    for (let i = 0; i < this.content.length; i++) {
      const word = this.content[i];
      const target = word.origin;
      frequency.set(target, (frequency.get(target) ?? 0) + 1);
      await ipcRenderer.invoke('queryChinese', target, 3).then(val => {
        let got = 0;
        for (const entry of val) {
          if (got) break;
          for (const splittedContent of [...(entry.content ?? '').split('，'), ...(entry.simplified ?? '').split(', ')]) {
            try {
              if (splittedContent === target) {
                got = 1;
                let cleanedFirst = entry.meaning.join('\n')
                for (let iter = 0; iter < 3; iter++) {
                  cleanedFirst = cleanedFirst.replace(/\([^)(]*\)/, "");
                }
                for (let iter = 0; iter < 3; iter++) {
                  cleanedFirst = cleanedFirst.replace(/\[[^\]\[]*]/, "");
                }
                const tmpMeaning = cleanedFirst.split(/[,;\n]/);
                if (tmpMeaning.length > 0 && tmpMeaning[0].length > 10) {
                  tmpMeaning.sort((a, b) => a.length - b.length);
                }
                for (const meaningEl of tmpMeaning) {
                  let cleanedMeaning = meaningEl.trim();
                  cleanedMeaning = cleanedMeaning.replace(/\(.*/, "")
                  cleanedMeaning = cleanedMeaning.replace(/\|.*/, "");
                  if (cleanedMeaning !== "" && cleanedMeaning.length <= 10) {
                    this.meaning[i] = cleanedMeaning;
                    break;
                  }
                }
                break;
              }
            } catch (ignored) {
              console.error(ignored)
            }
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

  frequency: Map<string, number>;

  constructor(content: string = '', language: string = videoConstants.japaneseLang) {
    this.frequency = new Map();
    this.id = randomUUID();
    this.lines = []
    if (content === '') return
    this.language = language
    this.lines.push(new Line(0, 1000000, content));
    return
  }

  static async create(filename: string, lang: string, isSimplified : boolean) {
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
    this.createFromArrayEntries(subtitleContainer, entries, lang, isSimplified);
    return subtitleContainer;
  }


  static createFromArrayEntries(subtitleContainer: SubtitleContainer, entries: Entry[], lang: string, isSimplified : boolean = true) {
    if (subtitleContainer === null) {
      subtitleContainer = new SubtitleContainer();
    }
    let ans = 0;
    entries = entries.filter(entry => entry.text != '');
    for (let i = 0; i < Math.min(20, entries.length); i++) {
      if (entries[i].text.match(videoConstants.cjkRegex)) {
        ans++;
      }
    }
    entries.sort((a, b) => a.from - b.from);
    subtitleContainer.language = videoConstants.englishLang;
    if (ans >= 3) subtitleContainer.language = lang;
    let last = 0;
    for (const {from, to, text} of entries) {
      // process transcript entry
      const realFrom = Math.max(from - videoConstants.subtitleFramerate * videoConstants.subtitleStartPlusMultiplier, last);
      const realTo = to + videoConstants.subtitleFramerate * videoConstants.subtitleEndPlusMultiplier;
      if(realFrom > realTo) continue;
      let changeAccent = noChanger;
      if(lang === videoConstants.chineseLang) {
        if(isSimplified) changeAccent = toSimplified;
        else changeAccent = toTraditional;
      }
      subtitleContainer.lines.push(new Line(Math.max(from, last), realTo, preProcess(text, changeAccent)));
      last = Math.max(last, realTo + videoConstants.subtitleFramerate + 1);
    }
    return subtitleContainer;
  }

  async adjustJapanese(tokenizeMiteiru: (string) => Promise<any[]>) {
    for (let i = 0; i < this.lines.length; i++) {
      if (globalSubtitleId !== this.id) return;
      const line = this.lines[i];
      await line.fillContentSeparations(tokenizeMiteiru)
      await line.fillContentWithLearningKotoba(this.frequency);
      this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
    }
    this.progress = 'done';
  }

  async adjustChinese(tokenizeMiteiru: (string) => Promise<any[]>) {
    for (let i = 0; i < this.lines.length; i++) {
      if (globalSubtitleId !== this.id) return;
      const line = this.lines[i];
      await line.fillContentSeparations(tokenizeMiteiru);
      await line.fillContentWithLearningChinese(this.frequency);
      this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
    }
    this.progress = 'done';
  }
}

export function getLineByTime(subtitle: SubtitleContainer, t: number) {
  if (!subtitle.lines || subtitle.lines.length === 0) {
    return {
      content: '',
      meaning: []
    };
  }
  let low = 0;
  let high = subtitle.lines.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (subtitle.lines[mid].timeStart <= t) low = mid;
    else high = mid - 1;
  }
  if (subtitle.lines[low].timeStart <= t && t <= subtitle.lines[low].timeEnd) {
    return {
      content: subtitle.lines[low].content,
      meaning: subtitle.lines[low].meaning,
      timePair: [subtitle.lines[low].timeStart, subtitle.lines[low].timeEnd]
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

interface YoutubeSubtitleEntry {
  start: string;
  dur: string;
  text: string;
}

export const convertSubtitlesToEntries = (subtitles: YoutubeSubtitleEntry[]): Entry[] => {
  return subtitles.map((subtitle, index) => {
    const start = Math.round(parseFloat(subtitle.start) * 1000);
    const dur = Math.round(parseFloat(subtitle.dur) * 1000);
    return {
      id: `subtitle-${index}`,
      from: start,
      to: start + dur,
      text: subtitle.text,
    };
  });
};

export const cleanHearingImpaired = (text) => {
  const lines = text.split('\n');

  return lines.map(line => {
    // Discard anything in square brackets
    let cleanedLine = line.replace(/\[.*?]/g, '');

    // Discard anything in brackets
    const brackets = [/\[.*?]/g, /\(.*?\)/g, /（.*?）/g, /「.*?」/g, /『.*?』/g, /【.*?】/g];
    for (const bracket of brackets) {
      cleanedLine = cleanedLine.replace(bracket, '');
    }

    // Discard anything preceding a colon
    cleanedLine = cleanedLine.replace(/.*?:/g, '');

    // Remove multiple spaces
    cleanedLine = cleanedLine.replace(/\s\s+/g, ' ').trim();

    return cleanedLine;
  }).join('\n');
};
