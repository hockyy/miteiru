import path from "node:path";
import {parseSrtContent} from "./getSubtitles";

export type SrtCue = {
  start: number;
  end: number;
  text: string;
};

const CUE_PUNCTUATION = "。！？!?，、；;";

function splitOnPunctuation(text: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  for (const character of text) {
    buffer += character;
    if (CUE_PUNCTUATION.includes(character)) {
      parts.push(buffer);
      buffer = "";
    }
  }
  if (buffer) {
    parts.push(buffer);
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function formatSrtTimestampFromMs(milliseconds: number): string {
  const normalizedMs = Math.max(0, Math.trunc(milliseconds));
  const ms = normalizedMs % 1000;
  const totalSeconds = Math.floor(normalizedMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

export function formatSrtTimestampFromSeconds(seconds: number): string {
  return formatSrtTimestampFromMs(Math.round(seconds * 1000));
}

export function splitCues(
  text: string,
  start: number,
  end: number,
  maxChars = 22
): SrtCue[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  let parts = splitOnPunctuation(cleaned);
  if (parts.length === 0) {
    parts = [cleaned];
  }

  const merged: string[] = [];
  let buffer = "";
  for (const part of parts) {
    if (buffer && buffer.length + part.length > maxChars) {
      merged.push(buffer);
      buffer = part;
    } else {
      buffer += part;
    }
  }
  if (buffer) {
    merged.push(buffer);
  }

  const lines: string[] = [];
  for (const part of merged) {
    let remaining = part;
    while (remaining.length > maxChars * 2) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    if (remaining) {
      lines.push(remaining);
    }
  }

  const duration = Math.max(end - start, 0.2);
  const weights = lines.map((line) => Math.max(line.length, 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const cues: SrtCue[] = [];
  let cursor = start;
  for (let i = 0; i < lines.length; i++) {
    const span = duration * (weights[i] / total);
    const cueEnd = i === lines.length - 1 ? end : cursor + span;
    cues.push({start: cursor, end: Math.max(cueEnd, cursor + 0.04), text: lines[i]});
    cursor = cueEnd;
  }
  return cues;
}

export type TranscriptionSegment = {
  text?: string;
  start?: number;
  end?: number;
};

export type TranscriptionBody = {
  text?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
};

export function cuesFromTranscription(
  body: TranscriptionBody,
  offset = 0,
  options: {convertText?: (text: string) => string; maxChars?: number} = {}
): SrtCue[] {
  const convertText = options.convertText ?? ((text: string) => text);
  const maxChars = options.maxChars ?? 22;
  const segments = body.segments ?? [];

  if (segments.length > 0) {
    const cues: SrtCue[] = [];
    for (const segment of segments) {
      const text = convertText((segment.text || "").trim());
      const start = Number(segment.start || 0) + offset;
      let end = Number(segment.end || start) + offset;
      if (end <= start) {
        end = start + 0.4;
      }
      cues.push(...splitCues(text, start, end, maxChars));
    }
    return cues;
  }

  const text = convertText((body.text || "").trim());
  const duration = Number(body.duration || 0);
  return splitCues(text, offset, offset + Math.max(duration, 1), maxChars);
}

export function cuesToSrt(cues: SrtCue[]): string {
  return cues
    .map((cue, index) => [
      String(index + 1),
      `${formatSrtTimestampFromSeconds(cue.start)} --> ${formatSrtTimestampFromSeconds(cue.end)}`,
      cue.text
    ].join("\n"))
    .join("\n\n") + (cues.length ? "\n" : "");
}

export function parseSrtCues(content: string): SrtCue[] {
  return parseSrtContent(content).map((entry) => {
    const start = Number.parseFloat(entry.start);
    const duration = Number.parseFloat(entry.dur);
    return {
      start,
      end: start + duration,
      text: entry.text
    };
  });
}

export function siblingEnglishSrtPath(sourceSrtPath: string): string {
  const dir = path.dirname(sourceSrtPath);
  const base = path.basename(sourceSrtPath, path.extname(sourceSrtPath));
  const stem = base.replace(/\.(yue|ja|zh|vi|en)$/i, "");
  return path.join(dir, `${stem}.en.srt`);
}

export function sanitizeSubtitleStem(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "video";
}
