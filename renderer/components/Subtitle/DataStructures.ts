import { toRomaji } from 'wanakana'
import { videoConstants } from "../../utils/constants";
import { v4 as uuidv4 } from 'uuid';
import type { SubtitleEntry as Entry } from "../../../main/helpers/subtitleParser";
import * as OpenCC from 'opencc-js';
import { parse as parseASS } from 'ass-compiler';
import { parseLRC } from "./LrcParser";
import {fillSubtitleWithLearningContent, TokenizeMiteiru} from "./subtitleLanguageSupport";
import {languageCodes} from "../../languages/manifest";

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

interface HufWord {
  content?: string;
}

interface HufSentence {
  id?: string;
  startMs?: number;
  endMs?: number;
  words?: HufWord[];
}

interface HufDocument {
  format?: string;
  version?: string;
  syncMs?: number;
  singer?: string | string[];
  sentences?: HufSentence[];
  contents?: HufSentence[];
}

const appendHufWords = (words: HufWord[] = []): string => {
  return words.map((word) => (typeof word?.content === 'string' ? word.content : '')).join('');
};

const parseHufToEntries = (content: string): Entry[] => {
  let parsed: HufDocument;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid HUF JSON content');
  }

  if (parsed?.format !== 'holokara-unified-format') {
    throw new Error('Invalid HUF format');
  }

  const rawSentences = Array.isArray(parsed.sentences)
    ? parsed.sentences
    : (Array.isArray(parsed.contents) ? parsed.contents : []);
  const syncMs = Number.isFinite(parsed.syncMs) ? Number(parsed.syncMs) : 0;

  return rawSentences
  .map((sentence, index) => {
    const from = Number(sentence?.startMs);
    const to = Number(sentence?.endMs);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

    return {
      id: sentence?.id ?? `sentence-${(index + 1).toString().padStart(3, '0')}`,
      from: Math.trunc(from + syncMs),
      to: Math.trunc(to + syncMs),
      text: appendHufWords(sentence?.words)
    } as Entry;
  })
  .filter((entry): entry is Entry => entry !== null);
};

const getRomajiFromSeparation = (separation: any): string => {
  if (!Array.isArray(separation)) return '';

  const directRomaji = separation
  .map((part) => (typeof part?.romaji === 'string' ? part.romaji : ''))
  .join('');
  if (directRomaji !== '') return directRomaji;

  const joinedHiragana = separation
  .map((part) => (typeof part?.hiragana === 'string' ? part.hiragana : ''))
  .join('');
  if (joinedHiragana !== '') return toRomaji(joinedHiragana);

  return '';
};

const buildRubyMapFromToken = (token: any): Record<string, string> => {
  const rubyMap: Record<string, string> = {};
  const hiragana = typeof token?.hiragana === 'string' ? token.hiragana : '';
  const romaji =
    (typeof token?.romaji === 'string' ? token.romaji : '') ||
    getRomajiFromSeparation(token?.separation) ||
    (hiragana ? toRomaji(hiragana) : '');
  const candidates: Array<[string, string]> = [
    ['hiragana', hiragana],
    ['romaji', romaji],
    ['pinyin', token?.pinyin],
    ['jyutping', token?.jyutping],
    ['meaning', token?.meaning]
  ];

  for (const [key, value] of candidates) {
    if (typeof value === 'string' && value !== '') {
      rubyMap[key] = value;
    }
  }

  return rubyMap;
};

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

  async fillContentSeparations(tokenizeMiteiru: TokenizeMiteiru) {
    this.content = await tokenizeMiteiru((this.content as string).replace(/\n/g, " "));
  }
}

let globalSubtitleId = "";

export const setGlobalSubtitleId = (id) => {
  globalSubtitleId = id;
};

/** Whether `id` belongs to the primary subtitle currently shown (others stop their processing). */
export const isCurrentSubtitle = (id: string) => globalSubtitleId === id;

export class SubtitleContainer {
  id: string;
  lines: Line[];
  language: string;
  path: string = '';
  progress: string = '';

  frequency: Map<string, number>;

  constructor(content: string = '', language: string = languageCodes.japanese) {
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
      } else if (parsedSubtitle.type === 'huf') {
        entries = parseHufToEntries(parsedSubtitle.content);
      } else {
        entries = parsedSubtitle.content.entries;
      }
      this.createFromArrayEntries(subtitleContainer, entries, lang, isSimplified);
      return subtitleContainer;
    } catch (error) {
      console.error('Error parsing subtitle:', error);
      throw error;
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
      if (lang === languageCodes.mandarin) {
        if (isSimplified) changeAccent = toSimplified;
        else changeAccent = toTraditional;
      }
      subtitleContainer.lines.push(new Line(Math.max(from, last), realTo, preProcess(text, changeAccent)));
      last = Math.max(last, realTo + videoConstants.subtitleFramerate + 1);
    }
    return subtitleContainer;
  }

  toHuf(singer: string | string[] = [], version: string = '0.1.0', syncMs: number = 0) {
    const normalizedSingers = Array.isArray(singer)
      ? singer.filter((item) => typeof item === 'string' && item.trim() !== '')
      : (typeof singer === 'string' && singer.trim() !== '' ? [singer] : []);

    const sentences = this.lines.map((line, lineIndex) => {
      const words = Array.isArray(line.content)
        ? line.content.map((token, tokenIndex) => {
          const rubyMap = buildRubyMapFromToken(token);
          const word = {
            intId: tokenIndex + 1,
            content: token?.origin ?? token?.main ?? '',
            startMs: line.timeStart
          } as any;
          if (Object.keys(rubyMap).length > 0) {
            word.rubyMap = rubyMap;
          }
          return word;
        })
        : [{
          intId: 1,
          content: typeof line.content === 'string' ? line.content : '',
          startMs: line.timeStart
        }];

      return {
        id: `sentence-${(lineIndex + 1).toString().padStart(3, '0')}`,
        startMs: line.timeStart,
        endMs: line.timeEnd,
        words
      };
    });

    return {
      format: 'holokara-unified-format',
      version,
      syncMs,
      singer: normalizedSingers,
      sentences
    };
  }

  toHufString(singer: string | string[] = [], version: string = '0.1.0', syncMs: number = 0) {
    return JSON.stringify(this.toHuf(singer, version, syncMs), null, 2);
  }

  async adjustForLearning(tokenizeMiteiru: TokenizeMiteiru) {
    await fillSubtitleWithLearningContent(this, tokenizeMiteiru, () => isCurrentSubtitle(this.id));
  }
}

/** Index of the last line starting at or before `t` (ms), or -1. Lines are in start order and do not overlap. */
export const findLastLineStartingBy = (lines: Line[] | undefined, t: number): number => {
  if (!lines?.length || t < lines[0].timeStart) return -1;
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lines[mid].timeStart <= t) low = mid;
    else high = mid - 1;
  }
  return low;
};

/** Index of the line shown at `t` (ms), or -1 between lines. */
export const findLineIndexAt = (lines: Line[] | undefined, t: number): number => {
  const index = findLastLineStartingBy(lines, t);
  return index >= 0 && t <= lines[index].timeEnd ? index : -1;
};

/** Which lines to show at `adjustedTime`: the current one at `currentLinePosition`, else the next one there. */
export const getLyricsWindow = (lines: Line[] | undefined, adjustedTime: number, linesVisible: number, currentLinePosition: number) => {
  if (!lines?.length) return {start: 0, current: -1};
  const last = findLastLineStartingBy(lines, adjustedTime);
  if (last >= 0 && adjustedTime <= lines[last].timeEnd) {
    const start = Math.max(0, last - currentLinePosition);
    return {start, current: last - start};
  }
  // Between lines: lead up to the next one; past the end: the last few.
  const next = last + 1;
  const start = next < lines.length ? Math.max(0, next - currentLinePosition) : Math.max(0, lines.length - linesVisible);
  return {start, current: -1};
};

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

    // Discard anything in brackets used for sound or speaker annotations.
    // 「」 and 『』 are quoted speech in Japanese subtitles, so they stay.
    const brackets = [/\[.*?]/g, /\(.*?\)/g, /（.*?）/g, /【.*?】/g];
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
