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


const tmp = `1
00:00:53,140 --> 00:00:54,710
仕事 行くか...

2
00:01:16,400 --> 00:01:20,120
木ぃ切って 月収6万だろ~

3
00:01:20,880 --> 00:01:25,250
この間 売った
腎臓が... 120万

4
00:01:26,180 --> 00:01:29,480
右目が... 30万

5
00:01:29,960 --> 00:01:32,370
金玉 片方 売って

6
00:01:33,090 --> 00:01:37,220
いくらで 売れたっけ?
10万も しなかったんだっけ?

7
00:01:40,290 --> 00:01:42,870
残りの借金が...
`;

export class SubtitleContainer {
  lines: Line[];
  language: string;

  constructor(filename: string) {
    if (filename === '') return
    console.log(filename)
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
      console.log(subtitle.lines[mid].timeStart, t)
      if (subtitle.lines[mid].timeStart <= t) low = mid;
      else high = mid - 1;
    }
    console.log(subtitle.lines[low])
    console.log(t)
    if (subtitle.lines[low].timeStart <= t && t <= subtitle.lines[low].timeEnd) {
      console.log("OK")
      return subtitle.lines[low].content;
    } else {
      return '';
    }
  }