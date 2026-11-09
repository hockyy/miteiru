/** Regenerate the compact word → HSK 3.0 level asset; see its adjacent README and MIT licence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const HSK_SOURCE_COMMIT = '7ac65bf1a6387d35f1ade478906172a19311c7f9';
const source = `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/${HSK_SOURCE_COMMIT}/`;

interface SourceWord {s: string; l: string[]; f?: {t: string}[]}

/** n7 is the source's combined 7–9 band. Old HSK (o*) and TOCFL (t*) are excluded. */
export const compactHskWords = (entries: readonly SourceWord[]): Record<string, number> => {
  const words = new Map<string, number>();
  for (const entry of entries) {
    const levels = entry.l.filter((level) => /^n[1-7]$/.test(level)).map((level) => Number(level.slice(1)));
    if (!levels.length) continue;
    const level = Math.min(...levels);
    for (const form of [entry.s, ...(entry.f ?? []).map((form) => form.t)]) {
      const word = form.trim().normalize('NFC');
      if (word) words.set(word, Math.min(words.get(word) ?? level, level));
    }
  }
  return Object.fromEntries([...words].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
};

const build = async () => {
  const download = async (name: string) => {
    const response = await fetch(source + name);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.text();
  };
  const [raw, license] = await Promise.all([download('complete.min.json'), download('LICENSE')]);
  if (!license.startsWith('MIT License') || !license.includes('Permission is hereby granted, free of charge')) {
    throw new Error('Check the upstream licence before regenerating HSK data.');
  }
  const words = compactHskWords(JSON.parse(raw));
  const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../renderer/public/study-data/mandarin-hsk');
  await fs.mkdir(output, {recursive: true});
  const json = JSON.stringify(words) + '\n';
  await fs.writeFile(path.join(output, 'words.json'), json);
  await fs.writeFile(path.join(output, 'LICENSE'), license);
  console.log(`Mandarin HSK: ${Object.keys(words).length} forms, ${Buffer.byteLength(json)} bytes, source ${HSK_SOURCE_COMMIT}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((error) => {console.error(error); process.exitCode = 1;});
}
