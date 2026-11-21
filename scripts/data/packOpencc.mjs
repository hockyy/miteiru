// node scripts/data/packOpencc.mjs <unpacked opencc-js 1.4.1 package>
// Each unbundled release dictionary is a single data literal. Preserve its bytes and entry order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {constants, zstdCompressSync, zstdDecompressSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const source = process.argv[2];
if (!source || JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version !== '1.4.1') {
  throw new Error('Pass the path to the unpacked opencc-js 1.4.1 package');
}
const names = ['CJK_Compatibility_Ideographs', 'STCharacters', 'STPhrases', 'STPhrases_GeneratedFromRegionalPhrases',
  'TSCharacters', 'TSPhrases', 'HKVariants', 'HKVariantsPhrases', 'TWVariants', 'TWVariantsPhrases',
  'TWVariantsRev', 'TWVariantsRevPhrases'];
const target = fileURLToPath(new URL('../../native/rust/crates/miteiru-opencc/data/', import.meta.url));
fs.mkdirSync(target, {recursive: true});
for (const name of names) {
  const file = fs.readFileSync(path.join(source, 'dist/esm-lib/dict', name + '.js'), 'utf8');
  const original = Buffer.from(JSON.parse(/^export default (".*");\s*$/su.exec(file)[1]), 'utf8');
  assert.ok(!original.includes(Buffer.from('\ufffd')), name + ' must preserve unmatched UTF-16 code units');
  const packed = zstdCompressSync(original, {params: {[constants.ZSTD_c_compressionLevel]: 19}});
  assert.deepEqual(zstdDecompressSync(packed), original);
  fs.writeFileSync(path.join(target, name + '.zst'), packed);
}
