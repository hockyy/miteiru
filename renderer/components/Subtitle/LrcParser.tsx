// Add this interface for LRC entries
import {Entry} from "@plussub/srt-vtt-parser/dist/src/types";

export interface LrcEntry {
  time: number;
  text: string;
}

// Add this function to parse LRC format
export function parseLRC(content: string): Entry[] {
  console.log(content);
  const lines = content.split('\n');
  const entries: Entry[] = [];
  let id = 0;

  // Regex to match LRC time format [mm:ss.xx] or [mm:ss]
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Skip metadata tags like [ar:], [ti:], [al:], etc.
    if (trimmedLine.match(/^\[[a-z]+:/)) continue;

    let match;
    const timestamps: number[] = [];
    let lastIndex = 0;

    // Extract all timestamps from the line
    while ((match = timeRegex.exec(trimmedLine)) !== null) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const centiseconds = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;

      const timeInMs = (minutes * 60 + seconds) * 1000 + centiseconds;
      timestamps.push(timeInMs);
      lastIndex = match.index + match[0].length;
    }

    // Extract text after the last timestamp
    const text = trimmedLine.substring(lastIndex).trim();

    // Create entries for each timestamp (some LRC files have multiple timestamps per line)
    for (const timestamp of timestamps) {
      entries.push({
        id: (id++).toString(),
        from: timestamp,
        to: timestamp + 3000, // Default 3 second duration, will be adjusted later
        text: text
      });
    }
  }

  // Sort entries by start time
  entries.sort((a, b) => a.from - b.from);

  // Adjust end times based on next entry's start time
  for (let i = 0; i < entries.length - 1; i++) {
    entries[i].to = entries[i + 1].from;
  }

  // Remove entries with empty text
  return entries.filter(entry => entry.text.length > 0);
}
