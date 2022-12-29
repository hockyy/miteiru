import {getFurigana, isMixedJapanese} from "shunou";
import fs from 'fs';
import {parse} from '@plussub/srt-vtt-parser';


export class Line {
  timeStart: number;
  timeEnd: number;
  content: any[];

  constructor(start, end, strContent, isInJapanese = true) {
    this.timeStart = start
    this.timeEnd = end
    if (isInJapanese) {
      this.content = getFurigana(strContent)
      console.log(this.content)
    } else {
      this.content = strContent
    }
  }
}

export class SubtitleContainer {
  lines: Line[];
  language: string;

  constructor(filename: string) {
    this.lines = []
    if (filename === '') return
    const {entries} = parse(
        fs
        .readFileSync(filename) // or '.srt'
        .toString()
    );

    const totalLine = entries.length >> 1;
    let totalMixed = 0;
    this.language = "EN"
    for (const {text} of entries) {
      // process transcript entry
      totalMixed += isMixedJapanese(text) ? 1 : 0;
      if (totalMixed >= totalLine) {
        this.language = "JP"
      }
    }

    entries.forEach(({from, to, text}) => {
      // process transcript entry
      this.lines.push(new Line(from, to, text, this.language === "JP"))
    });
  }
}


export function getLineByTime(subtitle: SubtitleContainer, t: number) {
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