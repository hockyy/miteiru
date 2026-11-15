import fsPromises from "node:fs/promises";
import path from "path";
import {parseHskWords, type HskWords} from "./hsk";
import {parsePitchAccentMap, type PitchAccentMap} from "./pitchAccent";
import {parseJapaneseLevels, type JapaneseLevels} from "./japaneseLevels";

/**
 * The study data the renderer loads by URL from the app's own export (renderer/public), for main/:
 * pitch accents, HSK levels, and the Japanese JLPT levels and frequency ranks. They are small files
 * the language packs don't carry.
 *
 * Read from disk under each root (renderer/public in a checkout, the worker's __dirname in a
 * development run), else, in the app's backend worker, fetched from the page's own origin. Each file
 * is read once; a missing or damaged one counts as no data and is not asked for again.
 */
export const STUDY_DATA_FILES = {
  pitchAccents: "language-assets/japanese/pitch/accents.json",
  hsk: "study-data/mandarin-hsk/words.json",
  japaneseLevels: "study-data/japanese-levels/words.json"
} as const;

let roots: string[] | null = null;
const loaded = new Map<string, Promise<unknown>>();

/** Where the renderer's public files are on disk (the headless server sets the checkout's renderer/public). */
export const setStudyDataRoots = (dirs: string[]) => {
  roots = dirs;
  loaded.clear();
};

const currentRoots = (): string[] => {
  if (roots) return roots;
  // The backend worker sets __dirname to renderer/public in a development run (worker.ts).
  const dirname = (globalThis as {__dirname?: unknown}).__dirname;
  return typeof dirname === "string" && dirname ? [dirname] : [];
};

const readJson = async (relative: string): Promise<unknown> => {
  for (const root of currentRoots()) {
    try {
      return JSON.parse(await fsPromises.readFile(path.join(root, relative), "utf8"));
    } catch {
      // Not here (a packaged build keeps them only in the page's export), or damaged: the next place.
    }
  }
  // A web worker's relative URL is the page's own origin; Node has no `location`.
  if (typeof (globalThis as {location?: unknown}).location !== "undefined" && typeof fetch === "function") {
    try {
      const response = await fetch(`/${relative}`);
      if (response.ok) return await response.json();
    } catch {
      // No data.
    }
  }
  return null;
};

const once = <T>(relative: string, parse: (raw: unknown) => T | null): () => Promise<T | null> => () => {
  let pending = loaded.get(relative) as Promise<T | null> | undefined;
  if (!pending) {
    pending = readJson(relative).then((raw) => (raw === null ? null : parse(raw)), () => null);
    loaded.set(relative, pending);
  }
  return pending;
};

export const loadPitchAccents: () => Promise<PitchAccentMap | null> = once(STUDY_DATA_FILES.pitchAccents, parsePitchAccentMap);
export const loadHskWords: () => Promise<HskWords | null> = once(STUDY_DATA_FILES.hsk, parseHskWords);
export const loadJapaneseLevels: () => Promise<JapaneseLevels | null> = once(STUDY_DATA_FILES.japaneseLevels, parseJapaneseLevels);
