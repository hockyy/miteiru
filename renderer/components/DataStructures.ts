import {getFurigana, isMixedJapanese} from "shunou";
import fs from 'fs';
import {parse as parseSRT} from '@plussub/srt-vtt-parser';
import {parse as parseASS, stringify, compile, decompile} from 'ass-compiler';


export class Line {
  timeStart: number;
  timeEnd: number;
  content: any[];

  constructor(start, end, strContent, mecab, isInJapanese = true) {
    this.timeStart = start
    this.timeEnd = end
    if (isInJapanese) {
      this.content = getFurigana(strContent, mecab)
    } else {
      this.content = strContent
    }
  }
}

export class SubtitleContainer {
  lines: Line[];
  language: string;

  constructor(filename: string, mecab: string, fromFile: boolean = true) {
    if (filename === '') return
    this.lines = []
    if (!fromFile) {
      this.language = "JP"
      this.lines.push(new Line(0, 1000000, filename, mecab, this.language === "JP"))
      return
    }

    let entries;

    if (filename.endsWith('.ass')) {
      const data = parseAssSubtitle(filename);
    } else {

      const data = parseSRT(
          fs
          .readFileSync(filename) // or '.srt'
          .toString()
      );
      entries = data.entries;
    }

    this.language = "EN"
    for (const {text} of entries) {
      // process transcript entry
      if (isMixedJapanese(text)) {
        this.language = 'JP';
        break;
      }
    }

    entries.forEach(({from, to, text}) => {
      // process transcript entry
      this.lines.push(new Line(from, to, text, mecab, this.language === "JP"))
    });
  }
}

export function getLineByTime(subtitle: SubtitleContainer, shift: number, t: number) {
  t -= shift
  if (!subtitle.lines || subtitle.lines.length === 0) return ''
  let low = 0;
  let high = subtitle.lines.length - 1;
  while (low < high) {
    let mid = (low + high + 1) >> 1;
    if (subtitle.lines[mid].timeStart <= t) low = mid;
    else high = mid - 1;
  }
  if (subtitle.lines[low].timeStart <= t && t <= subtitle.lines[low].timeEnd) {
    return subtitle.lines[low].content;
  } else {
    return '';
  }
}

function parseAssSubtitle(filename: string) {

  const text = fs.readFileSync(filename).toString();

// parse just turn ASS text into JSON
  const parsedASS = parseASS(text);

// Extract plain-text dialogue lines
  const entries = parsedASS.events.dialogue.map((event, index) => {
    return {
      id: index,
      from: event.Start,
      to: event.End,
      text: event.Text.raw,
    };
  });

  const parsedResult = {
    entries,
  };
}