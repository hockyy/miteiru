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

/**
 * Entries in start order (ASS scripts and MKV tracks keep the script's own order, with the songs
 * often first), with cues that share both start and end joined into one: two speakers shown at once.
 */
export const mergeSameTimeEntries = (entries: Entry[]): Entry[] => {
  const sorted = entries.map((entry, index) => ({entry, index}))
      .sort((a, b) => a.entry.from - b.entry.from || a.index - b.index)
      .map(({entry}) => entry);
  const merged: Entry[] = [];
  for (const entry of sorted) {
    // Equal starts sit side by side after the sort, so only the tail can match.
    let same: Entry | undefined;
    for (let i = merged.length - 1; i >= 0 && merged[i].from === entry.from; i--) {
      if (merged[i].to === entry.to) same = merged[i];
    }
    if (!same) {
      merged.push({...entry});
    } else if (!same.text.split('\n').includes(entry.text)) {
      same.text = `${same.text}\n${entry.text}`;
    }
  }
  return merged;
};

export class Line {
  timeStart: number;
  timeEnd: number;
  content: any[] | string;
  // The line as written; `content` becomes tokens once analysed, which drop spaces between words.
  readonly text: string;
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
    this.text = this.content as string;
  }

  async fillContentSeparations(tokenizeMiteiru: TokenizeMiteiru) {
    this.content = await tokenizeMiteiru(this.text.replace(/\n/g, " "));
  }
}

let globalSubtitleId = "";

export const setGlobalSubtitleId = (id) => {
  globalSubtitleId = id;
};

/** Whether `id` belongs to the primary subtitle currently shown (others stop their processing). */
export const isCurrentSubtitle = (id: string) => globalSubtitleId === id;

/** The gloss list of a line without glosses; shared so views can compare it by identity. */
export const NO_MEANING: string[] = [];

export class SubtitleContainer {
  id: string;
  lines: Line[];
  language: string;
  path: string = '';
  progress: string = '';

  frequency: Map<string, number>;
  private readonly changeListeners = new Set<() => void>();

  /** Runs `listener` whenever analysis gives lines tokens or glosses; returns the unsubscribe function. */
  onChange(listener: () => void) {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  notifyChanged() {
    this.changeListeners.forEach((listener) => listener());
  }

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
    } of mergeSameTimeEntries(entries)) {
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

  async adjustForLearning(tokenizeMiteiru: TokenizeMiteiru, getPlaybackTimeMs?: () => number) {
    await fillSubtitleWithLearningContent(
      this,
      tokenizeMiteiru,
      () => isCurrentSubtitle(this.id),
      () => {
        const time = getPlaybackTimeMs?.() ?? 0;
        const index = findLastLineStartingBy(this.lines, time);
        // Between cues, prepare the next line; seeking far into a long video should not wait for
        // every earlier line's readings and dictionary lookups.
        return index >= 0 && time > this.lines[index].timeEnd ? index + 1 : Math.max(0, index);
      }
    );
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

// Optional dialogue dash, then a label: ALL CAPS with digits ("MAN 1"), one or two capitalized words
// ("Narrator", "Mr. Smith"), or a short run before a full-width colon ("男："). A colon inside text has no
// space after it, and a sentence's own words aren't capitalized ("Rule one: never…" stays).
const SPEAKER_LABEL = new RegExp(
    String.raw`^\s*([-\u2013\u2014]\s*)?(?:` +
    String.raw`[A-Z][A-Z0-9.'\u2019-]*(?: [A-Z0-9.'\u2019-]+){0,3}:(?:\s+|$)` +
    String.raw`|\p{Lu}[\p{L}'\u2019.-]*(?: \p{Lu}[\p{L}'\u2019.-]*)?:(?:\s+|$)` +
    String.raw`|[^\s\d:\uFF1A]{1,12}\uFF1A\s*)`, "u");

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

    // Drop a speaker label at the start of the line, not every colon: times (10:30), ratios,
    // links and titles (Re:Zero) have to stay.
    cleanedLine = cleanedLine.replace(SPEAKER_LABEL, '$1');

    // Remove multiple spaces
    cleanedLine = cleanedLine.replace(/\s\s+/g, ' ').trim();

    return cleanedLine;
  }).join('\n');
};
