import {getFurigana} from "shunou";
import {parse as parseSRT} from '@plussub/srt-vtt-parser';
import {parse as parseASS} from 'ass-compiler';
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite"
import {isHiragana, isKatakana} from 'wanakana'
import {japaneseConstants} from "../utils/constants";


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
  content: any[];
  meaning: string[];

  constructor(start, end, strContent, mecab, isInJapanese = true) {
    this.timeStart = start
    this.timeEnd = end
    if (isInJapanese) {
      this.content = getFurigana(strContent, mecab);
    } else {
      this.content = strContent;
    }
  }

  async fillContentWithLearningKotoba(miteiruApi) {
    this.meaning = Array(this.content.length).fill('');
    for (let i = 0; i < this.content.length; i++) {
      const word = this.content[i];
      if ((isHiragana(word.origin) || isKatakana(word.origin)) && word.origin.length <= 2) continue;
      await miteiruApi('query', word.origin, 2).then(val => {
        let got = 0;
        for (const entry of val) {
          if (got) break;
          for (const reading of entry.kana) {
            if (got) break;
            try {
              if (reading.text === word.hiragana || (entry.kanji.length >= 1 && word.origin === entry.kanji[0].text)) {
                this.meaning[i] = entry.sense[0].gloss[0].text;
                this.meaning[i] = this.meaning[i].replace(/\((.*?)\)/g, '').trim();
                if (this.meaning[i].length > japaneseConstants.meaningLengthLimit) {
                  this.meaning[i] = ''
                }
                got = 1;
                break;
              }
            } catch (ignored) {
              console.log(ignored)
            }
          }
        }
      })

    }
  }
}

export class SubtitleContainer {
  lines: Line[];
  language: string;
  path: string = '';

  constructor(content: string, mecab: string) {
    this.lines = []
    if (content === '') return
    this.language = "JP"
    this.lines.push(new Line(0, 1000000, content, mecab, this.language === "JP"))
    return
  }

  static async create(filename: string, mecab: string, miteiruApi) {
    if (filename === '') return
    const subtitleContainer = new SubtitleContainer('', mecab);
    subtitleContainer.path = filename;
    let entries;
    const buffer = miteiruApi.getBuffer(filename);
    const blob = new Blob([buffer]);

    const currentData = await languageEncoding(blob);
    const text = iconv.decode(buffer, currentData.encoding)
    if (filename.endsWith('.ass')) {
      entries = parseAssSubtitle(text);
    } else {
      const data = parseSRT(text);
      entries = data.entries;
    }

    try {
      subtitleContainer.language = languageMap[currentData.language];
    } catch (e) {
      subtitleContainer.language = "EN";
    }
    for (const {from, to, text} of entries) {
      // process transcript entry
      subtitleContainer.lines.push(new Line(from, to, removeTags(text), mecab, subtitleContainer.language === "JP"))
      const back = subtitleContainer.lines[subtitleContainer.lines.length - 1];
      await back.fillContentWithLearningKotoba(miteiruApi);
    }
    return subtitleContainer
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