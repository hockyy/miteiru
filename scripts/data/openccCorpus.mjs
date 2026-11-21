import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = path.join(root, 'tests/fixtures');

const readLines = (file) => fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/u);

export function openccCorpus() {
  const lines = [];
  const directory = path.join(fixtures, 'tokenizer-eval');
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.jsonl')).sort()) {
    for (const line of readLines(path.join(directory, name))) {
      const row = JSON.parse(line);
      // Adjudications give the sentence as tokens. Dictionary exceptions give a surface.
      lines.push(row.text ?? row.gold?.join('') ?? row.token);
    }
  }
  for (const line of readLines(path.join(fixtures, 'japanese-readings/gold.jsonl'))) {
    lines.push(JSON.parse(line).text);
  }
  for (const name of ['chinese-tokenizer/mandarin.txt', 'chinese-tokenizer/cantonese.txt', 'japanese-subtitles.txt']) {
    lines.push(...readLines(path.join(fixtures, name)));
  }
  const edges = ['', 'ABC xyz', '0123.45% + 98', '！？……\r\n\t　', '😊𠮷𠀀🧑‍🚀',
    'e\u0301カナ汉字粵語HK-42', '米特字幕組喺地铁站睇字幕喵。', '地铁站和字幕喵字幕喵',
    '裏面乾乾淨淨，茶几上放著頭髮和麵條。', '一只手表系着一根头发。',
    '神車再，⿰言馬，⿱⿰木木龍，⿲木', '字幕喵abc𠮷😊乾杯！'.repeat(512)];
  return {lines: [...new Set([...lines, ...edges])], edges};
}
