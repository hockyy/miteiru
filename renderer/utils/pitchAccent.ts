/**
 * The word popup's pitch accent data, loaded by URL from the app's own export. The lookup and
 * classification live in main/language/pitchAccent.ts, which the language tools use too.
 */
import {parsePitchAccentMap, type PitchAccentMap} from '../../main/language/pitchAccent';

export * from '../../main/language/pitchAccent';

export const PITCH_ACCENT_URL = '/language-assets/japanese/pitch/accents.json';

let cachedMap: PitchAccentMap | null = null;
let pendingLoad: Promise<PitchAccentMap | null> | null = null;

/** Loads the bundled pitch accent map once; resolves to null when unavailable. */
export const loadPitchAccentMap = async (): Promise<PitchAccentMap | null> => {
  if (cachedMap) return cachedMap;
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    try {
      const response = await fetch(PITCH_ACCENT_URL);
      if (!response.ok) return null;
      const data = parsePitchAccentMap(await response.json());
      if (!data) return null;
      cachedMap = data;
      return cachedMap;
    } catch {
      return null;
    } finally {
      pendingLoad = null;
    }
  })();

  return pendingLoad;
};

/** Test-only hook to inject/reset the cached map. */
export const __setPitchAccentMapForTests = (map: PitchAccentMap | null): void => {
  cachedMap = map;
  pendingLoad = null;
};
