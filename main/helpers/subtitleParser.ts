/** One timed cue from an SRT or WebVTT file; times are in milliseconds. */
export interface SubtitleEntry {
  id: string;
  from: number;
  to: number;
  text: string;
}

// 01:02:03,500 / 01:02:03.500 (SRT, either separator), 02:03.500 (WebVTT without hours), 1:02:03,5
const TIMESTAMP = "(?:\\d+:)?\\d{1,2}:\\d{1,2}(?:[,.]\\d{1,3})?";
const TIMING_LINE = new RegExp(`^\\s*(${TIMESTAMP})\\s*-->\\s*(${TIMESTAMP})`);
const TIMESTAMP_PARTS = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/;
const CUE_NUMBER = /^\s*\d+\s*$/;

const toMilliseconds = (timestamp: string): number => {
  const [, hours = "0", minutes, seconds, fraction = ""] = timestamp.match(TIMESTAMP_PARTS);
  // The fraction is decimal: "1,5" is one and a half seconds, not 1.005.
  const milliseconds = Number(fraction.padEnd(3, "0"));
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + milliseconds;
};

const isBlank = (line: string | undefined) => line === undefined || line.trim() === "";

// YouTube's speech-recognition captions time their newest words inline: <00:00:01.234><c> word</c>.
// A file with these timestamps is read as rolling captions; a file with only <c.colour> styling is not.
const INLINE_TIMESTAMP = /<\d{1,2}:\d{2}:\d{2}[.,]\d{3}>/;
const INLINE_TAGS = /<\d{1,2}:\d{2}:\d{2}[.,]\d{3}>|<\/?c(?:\.[^>\s]*)?>/g;
// The 10 ms cues between rolling cues exist only to hold the old line; they are not worth showing.
const FLASH_CUE_MS = 100;

/**
 * Rolling captions repeat the previous cue's line above the new words. Drops the flash cues and that
 * repeated line, and strips the inline tags. A cue whose lines are all new keeps them all.
 */
const unrollCaptions = (input: string, entries: SubtitleEntry[]): SubtitleEntry[] => {
  if (!INLINE_TIMESTAMP.test(input)) return entries;
  const unrolled: SubtitleEntry[] = [];
  let shownLine = "";
  for (const entry of entries) {
    if (entry.to - entry.from < FLASH_CUE_MS) continue;
    const lines = entry.text.split("\n").map((line) => line.replace(INLINE_TAGS, "").trim()).filter(Boolean);
    while (lines.length > 1 && lines[0] === shownLine) lines.shift();
    shownLine = lines.at(-1) ?? "";
    unrolled.push({...entry, text: lines.join("\n")});
  }
  return unrolled;
};

/**
 * Parses SRT and WebVTT. A cue is a timing line plus the text lines up to the next blank line
 * (or up to the next cue when a file leaves the blank line out). Handles CRLF, `.` or `,` before
 * milliseconds, short fractions, VTT `mm:ss` times and cue settings, empty cues, and stray lines
 * such as WEBVTT headers or NOTE blocks, none of which make the whole file fail.
 */
export const parseSubtitleCues = (input: string): SubtitleEntry[] => {
  const lines = input.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const entries: SubtitleEntry[] = [];

  for (let index = 0; index < lines.length; index++) {
    const timing = lines[index].match(TIMING_LINE);
    if (!timing) continue;

    // The cue number (SRT) or identifier (VTT) is the line right before the timing, when that
    // line starts its own block.
    const previous = lines[index - 1];
    const id = !isBlank(previous) && isBlank(lines[index - 2]) ? previous.trim() : "";

    const textLines: string[] = [];
    let next = index + 1;
    while (next < lines.length && !TIMING_LINE.test(lines[next])) {
      if (isBlank(lines[next])) {
        // A line of only spaces inside a cue (YouTube's captions open with one) does not end it; an
        // empty line does. A spaces-only separator before the next cue still ends it.
        const inside = lines[next] !== "" && !isBlank(lines[next + 1]) && !TIMING_LINE.test(lines[next + 1])
          && !TIMING_LINE.test(lines[next + 2] ?? "");
        if (!inside) break;
      } else {
        textLines.push(lines[next]);
      }
      next++;
    }
    // Without a blank line between cues, the next cue's number ends up last; leave it to that cue.
    // A cue whose only text is a number keeps it.
    if (next < lines.length && TIMING_LINE.test(lines[next]) && textLines.length > 1 && CUE_NUMBER.test(textLines.at(-1))) {
      textLines.pop();
    }

    entries.push({id, from: toMilliseconds(timing[1]), to: toMilliseconds(timing[2]), text: textLines.join("\n")});
    index = next - 1;
  }

  return unrollCaptions(input, entries);
};
