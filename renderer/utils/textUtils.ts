/** Line splitting for learn textarea + AI translation input. See pages/learn.tsx handleMoveToAnalyzer. */
export function splitIntoLines(text: string): string[] {
  // One sentence per line; blank lines are dropped
  return text.split(/[\n\t]+/).map(line => line.trim()).filter(Boolean);
}
