// One fresh process per measurement. Pass an opencc-js 1.4.1 package directory or a built
// miteiru-node addon, optionally followed by a single conversion (all five by default).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openccCorpus} from './openccCorpus.mjs';

const source = path.resolve(process.argv[2]);
const pairs = {t2s: ['t', 'cn'], s2t: ['cn', 't'], s2hk: ['cn', 'hk'], s2tw: ['cn', 'tw'], tw2s: ['tw', 'cn']};
const modes = process.argv[3] ? [process.argv[3]] : Object.keys(pairs);
const {lines} = openccCorpus();
const upstream = fs.statSync(source).isDirectory();
const start = performance.now();
const convert = new Map();
if (upstream) {
  for (const mode of modes) {
    const file = path.join(source, 'dist/esm', mode === 't2s' ? 't2cn.js' : 'full.js');
    const {Converter} = await import(pathToFileURL(file).href);
    const [from, to] = pairs[mode];
    const fn = Converter({from, to});
    convert.set(mode, texts => texts.map(fn));
  }
} else {
  const module = {exports: {}};
  process.dlopen(module, source);
  for (const mode of modes) convert.set(mode, texts => module.exports.openccConvertBatch(mode, texts));
}
for (const fn of convert.values()) fn(['頭髮，里面，车。']);
const loadMs = performance.now() - start;
const peakRssMiB = process.resourceUsage().maxRSS / 1024;
const samples = [];
let chars = 0;
for (let i = 0; i < 10; i++) {
  const now = performance.now();
  for (const fn of convert.values()) {
    const result = fn(lines);
    chars += result[result.length - 1].length;
  }
  if (i) samples.push(performance.now() - now);
}
console.log(JSON.stringify({modes, lines: lines.length, loadMs, peakRssMiB,
  warmMs: samples.sort((a, b) => a - b)[4], chars}));
