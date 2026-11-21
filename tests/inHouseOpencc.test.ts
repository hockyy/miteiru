import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {zstdDecompressSync} from 'node:zlib';
import {convertOpencc} from '../main/headless/opencc';

const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/in-house/opencc-js.json'), 'utf8'));

test('the twelve native OpenCC dictionaries preserve the ordered 1.4.1 data', () => {
  for (const [name, expected] of Object.entries(fixture.dictionaries)) {
    const frame = fs.readFileSync(path.join(root, 'native/rust/crates/miteiru-opencc/data', name + '.zst'));
    assert.equal(createHash('sha256').update(zstdDecompressSync(frame)).digest('hex'), expected, name);
  }
});

test('all subtitle conversion modes match opencc-js 1.4.1 through the Node addon', () => {
  for (const mode of ['t2s', 's2t', 's2hk', 's2tw', 'tw2s'] as const) {
    assert.deepEqual(convertOpencc(mode, fixture.cases.map(row => row.text)), fixture.cases.map(row => row[mode]), mode);
    assert.deepEqual(convertOpencc(mode, []), []);
  }
});
