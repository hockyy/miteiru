// Build miteiru-node in release mode, then run:
// node scripts/data/recordOpencc.mjs <unpacked opencc-js 1.4.1> <miteiru_node.dll|libmiteiru_node.{so,dylib}>
// The reference is needed only to rebuild this fixture or repeat the full differential.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {openccCorpus, root} from './openccCorpus.mjs';

const [source, binary] = process.argv.slice(2);
if (!source || !binary || JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version !== '1.4.1') {
  throw new Error('Pass the opencc-js 1.4.1 directory and the built addon');
}
const module = {exports: {}};
process.dlopen(module, path.resolve(binary));
const esm = (name) => import(pathToFileURL(path.resolve(source, 'dist/esm', name + '.js')).href);
const full = await esm('full'), t2cn = await esm('t2cn');
const routes = {t2s: [t2cn, 't', 'cn'], s2t: [full, 'cn', 't'], s2hk: [full, 'cn', 'hk'],
  s2tw: [full, 'cn', 'tw'], tw2s: [full, 'tw', 'cn']};
const {lines, edges} = openccCorpus();
const all = new Set(lines);
const samples = new Set([...lines.filter((_, i) => i % 18 === 0), ...edges, '⿾车龙', '⿿车龙', '㇯车龙', '⿱⿰木車龍', '⿰⿱车',
  '\ud800龍\udc00\ufffd⿰车\udfff', '\udbff\udfff\udbff车', 'a\u0000台湾语言']);
const dictionaries = {};
const data = path.join(root, 'native/rust/crates/miteiru-opencc/data');
for (const packed of fs.readdirSync(data).filter(name => name.endsWith('.zst')).sort()) {
  const name = packed.slice(0, -4);
  const js = fs.readFileSync(path.join(source, 'dist/esm-lib/dict', name + '.js'), 'utf8');
  const text = JSON.parse(/^export default (".*");\s*$/su.exec(js)[1]);
  dictionaries[name] = createHash('sha256').update(text).digest('hex');
  const rows = text.split('|');
  const step = Math.max(1, Math.ceil(rows.length / 20));
  rows.forEach((row, i) => {
    const [key, value] = row.split(' ');
    all.add(key).add(value);
    if (i % step === 0) samples.add(key);
  });
}
for (const text of samples) all.add(text);
const inputs = [...all];
const cases = [...samples].map(text => ({text}));
for (const [mode, [library, from, to]] of Object.entries(routes)) {
  const convert = library.Converter({from, to});
  for (let i = 0; i < inputs.length; i += 2000) {
    const batch = inputs.slice(i, i + 2000);
    assert.deepEqual(module.exports.openccConvertBatch(mode, batch), batch.map(convert), mode);
  }
  for (const row of cases) row[mode] = convert(row.text);
}
const file = path.join(root, 'tests/fixtures/in-house/opencc-js.json');
const json = JSON.stringify({upstream: 'opencc-js 1.4.1', dictionaries, cases}) + '\n';
assert.ok(Buffer.byteLength(json) < 1_000_000);
fs.mkdirSync(path.dirname(file), {recursive: true});
fs.writeFileSync(file, json);
console.log(JSON.stringify({corpus: lines.length, inputs: inputs.length, comparisons: inputs.length * 5, differences: 0,
  fixtureCases: cases.length, fixtureBytes: Buffer.byteLength(json)}));
