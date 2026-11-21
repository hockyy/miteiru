/** Subtitle particles and dictionary readings recur across cues. Both callers convert
 * immutable strings with fixed options. Keep long lines out and bound each cache. */
export function cacheTokenReading(convert: (input: string) => string): (input: string) => string {
  let readings: Map<string, string> | undefined;
  return (input) => {
    if (input.length > 32) return convert(input);
    readings ??= new Map();
    const cached = readings.get(input);
    if (cached !== undefined) return cached;
    const result = convert(input);
    if (readings.size >= 2048) readings.clear();
    readings.set(input, result);
    return result;
  };
}
