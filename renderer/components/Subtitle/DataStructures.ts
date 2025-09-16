import {isHiragana, isKatakana, toHiragana} from 'wanakana'
import {videoConstants} from "../../utils/constants";
import {v4 as uuidv4} from 'uuid';
import {Entry} from "@plussub/srt-vtt-parser/dist/src/types";
import * as OpenCC from 'opencc-js';
import {parse as parseASS} from 'ass-compiler';
import {parseLRC} from "./LrcParser";

function removeTags(text) {
  const regex = /\{\\.+?}/g;
  return text.replace(regex, '');
}

const toSimplified = OpenCC.Converter({
  from: 'tw',
  to: 'cn'
});
const toTraditional = OpenCC.Converter({
  from: 'cn',
  to: 'tw'
});
const noChanger = (text: string) => {
  return text
};

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
      await window.ipc.invoke('queryJapanese', target, 2).then(val => {
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
      await window.ipc.invoke('queryChinese', target, 3).then(val => {
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

  async fillContentWithLearningVietnamese(frequency) {
    this.meaning = Array(this.content.length).fill('');
    for (let i = 0; i < this.content.length; i++) {
      const word = this.content[i];
      const target = word.origin;
      frequency.set(target, (frequency.get(target) ?? 0) + 1);
      await window.ipc.invoke('queryVietnamese', target, 3).then(val => {
        let got = 0;
        for (const entry of val) {
          if (got) break;
          try {
            if (entry.content === target) {
              got = 1;
              let cleanedMeaning = entry.meaning;
              // Clean up the meaning - remove parentheses and extra content
              cleanedMeaning = cleanedMeaning.replace(/\([^)(]*\)/g, "").trim();
              cleanedMeaning = cleanedMeaning.replace(/\[[^\]\[]*]/g, "").trim();
              
              // Split by common delimiters and take the shortest meaningful part
              const tmpMeaning = cleanedMeaning.split(/[,;]/);
              if (tmpMeaning.length > 0) {
                tmpMeaning.sort((a, b) => a.trim().length - b.trim().length);
                for (const meaningEl of tmpMeaning) {
                  const finalMeaning = meaningEl.trim();
                  if (finalMeaning !== "" && finalMeaning.length <= 15) {
                    this.meaning[i] = finalMeaning;
                    break;
                  }
                }
              }
              break;
            }
          } catch (ignored) {
            console.error(ignored)
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
    this.id = uuidv4();
    this.lines = []
    if (content === '') return
    this.language = language
    this.lines.push(new Line(0, 1000000, content));
    return
  }

  static async create(filename: string, lang: string, isSimplified: boolean) {
    if (filename === '') return
    const isForcedEnglish = filename.includes('.en.');
    const subtitleContainer = new SubtitleContainer();
    subtitleContainer.path = filename;

    try {
      const parsedSubtitle = await window.electronAPI.parseSubtitle(filename);
      let entries = []

      if (parsedSubtitle.type === 'ass') {
        const assData = parseASS(parsedSubtitle.content);
        entries = this.parseAssSubtitle(assData);
      } else if (parsedSubtitle.type === 'lrc' || filename.toLowerCase().endsWith('.lrc')) {
        // Handle LRC format
        entries = parseLRC(parsedSubtitle.content);
      } else {
        entries = parsedSubtitle.content.entries;
      }
      console.log(lang);
      console.log(isSimplified);
      this.createFromArrayEntries(subtitleContainer, entries,
          isForcedEnglish ? videoConstants.englishLang : lang, isSimplified);
      return subtitleContainer;
    } catch (error) {
      console.error('Error parsing subtitle:', error);
      return null;
    }
  }

  static parseAssSubtitle(parsedASS) {
    return parsedASS.events.dialogue.map((event, index) => {
      return {
        id: index.toString(),
        from: Math.round(event.Start * 1000),
        to: Math.round(event.End * 1000),
        text: event.Text.combined.replace(/\\N/g, '\n')
      };
    });
  }


  static createFromArrayEntries(subtitleContainer: SubtitleContainer, entries: Entry[], lang: string, isSimplified: boolean = true) {
    if (subtitleContainer === null) {
      subtitleContainer = new SubtitleContainer();
    }
    subtitleContainer.language = lang;
    let last = 0;
    for (const {
      from,
      to,
      text
    } of entries) {
      // process transcript entry
      const realFrom = Math.max(from - videoConstants.subtitleFramerate * videoConstants.subtitleStartPlusMultiplier, last);
      const realTo = to + videoConstants.subtitleFramerate * videoConstants.subtitleEndPlusMultiplier;
      if (realFrom > realTo) continue;
      let changeAccent = noChanger;
      if (lang === videoConstants.chineseLang) {
        if (isSimplified) changeAccent = toSimplified;
        else changeAccent = toTraditional;
      }
      subtitleContainer.lines.push(new Line(Math.max(from, last), realTo, preProcess(text, changeAccent)));
      last = Math.max(last, realTo + videoConstants.subtitleFramerate + 1);
    }
    return subtitleContainer;
  }

  async adjustJapanese(tokenizeMiteiru: (string) => Promise<any[]>) {
    const promises = [];

    for (let i = 0; i < this.lines.length; i++) {
      if (globalSubtitleId !== this.id) return;
      const line = this.lines[i];
      promises.push(line.fillContentSeparations(tokenizeMiteiru));
      promises.push(line.fillContentWithLearningKotoba(this.frequency));
      this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
    }
    await Promise.all(promises);
    this.progress = 'done';
  }

  async adjustChinese(tokenizeMiteiru: (string) => Promise<any[]>) {
    const promises = [];
    for (let i = 0; i < this.lines.length; i++) {
      if (globalSubtitleId !== this.id) return;
      const line = this.lines[i];
      promises.push(line.fillContentSeparations(tokenizeMiteiru));
      promises.push(line.fillContentWithLearningChinese(this.frequency));
      this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
    }
    await Promise.all(promises);
    this.progress = 'done';
  }

  async adjustVietnamese(tokenizeMiteiru: (string) => Promise<any[]>) {
    console.log(this.lines);
    const promises = [];
    for (let i = 0; i < this.lines.length; i++) {
      if (globalSubtitleId !== this.id) return;
      const line = this.lines[i];
      promises.push(line.fillContentSeparations(tokenizeMiteiru));
      promises.push(line.fillContentWithLearningVietnamese(this.frequency));
      this.progress = `${((i + 1) * 100 / this.lines.length).toFixed(2)}%`;
    }
    await Promise.all(promises);
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
