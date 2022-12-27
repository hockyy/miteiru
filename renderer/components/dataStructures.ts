import {getFurigana} from "shunou-js";
import fs from 'fs';
import {parse} from '@plussub/srt-vtt-parser';
import subtitle from "./Subtitle";


export class Line {
  timeStart: number;
  timeEnd: number;
  content: any[];

  constructor(start, end, strContent, isInJapanese = true) {
    this.timeStart = start
    this.timeEnd = end
    if (isInJapanese) {
      this.content = getFurigana(strContent)
    } else {
      this.content = strContent
    }
  }
}

export class SubtitleContainer {
  lines: Line[];
  language: string;

  constructor(filename: string) {
    if (filename === '') return
    const {entries} = parse(
        fs
        .readFileSync(filename) // or '.srt'
        .toString()
    );

    this.lines = []
    entries.forEach(({from, to, text, id}) => {
      // process transcript entry
      this.lines.push(new Line(from, to, text))
    });
  }
}


export function getLineByTime(subtitle: SubtitleContainer, t: number) {
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