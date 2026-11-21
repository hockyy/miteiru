// node scripts/data/buildPinyinData.mjs <pinyin-pro repository at tag 3.29.3>
// Read the TypeScript literals as data. The upstream build and its modules are never executed.
import fs from 'node:fs';
import path from 'node:path';
import {constants, zstdCompressSync} from 'node:zlib';
import ts from 'typescript';

const root = path.join(process.argv[2], 'packages/pinyin-pro');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.name !== 'pinyin-pro' || pkg.version !== '3.29.3') throw new Error('Expected pinyin-pro 3.29.3');
function objectLiteral(file, variable) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'lib/data', file), 'utf8'), ts.ScriptTarget.Latest);
  let literal;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.text === variable && ts.isObjectLiteralExpression(node.initializer)) {
      literal = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!literal) throw new Error(`Missing ${variable} in ${file}`);
  return Object.fromEntries(literal.properties.map(prop => {
    const value = prop.initializer;
    const string = node => {
      if (!ts.isStringLiteral(node)) throw new Error(`Expected a string in ${file}`);
      return node.text;
    };
    return [prop.name.text, ts.isArrayLiteralExpression(value) ? value.elements.map(string) : string(value)];
  }));
}

const rows = [];
function record(length, word, reading) {
  if (/[\t\r\n]/.test(word + reading)) throw new Error(`Unexpected delimiter in ${word}`);
  rows.push(`${length}\t${word}\t${reading}\n`);
}
for (const [reading, chars] of Object.entries(objectLiteral('dict1.ts', 'map'))) {
  for (const char of chars) record(1, char, reading);
}
for (const length of [5, 4, 3, 2]) {
  for (const [word, reading] of Object.entries(objectLiteral(`dict${length}.ts`, `DICT${length}`))) record(length, word, reading);
}
const rules = objectLiteral('special.ts', 'dict');
const numbers = objectLiteral('special.ts', 'Numbers');
const classifiers = objectLiteral('special.ts', 'NumberWordMap');
for (const [number, a] of Object.entries(numbers)) {
  for (const [classifier, b] of Object.entries(classifiers)) rules[number + classifier] = a + ' ' + b;
}
for (const [word, reading] of Object.entries(rules)) record(0, word, reading);
const data = Buffer.from(rows.join(''));
const packed = zstdCompressSync(data, {params: {[constants.ZSTD_c_compressionLevel]: 19}});
fs.writeFileSync(new URL('../../native/rust/crates/miteiru-pinyin/dictionary.tsv.zst', import.meta.url), packed);
console.log(`${rows.length} dictionary records, ${data.length} bytes, ${packed.length} compressed`);
