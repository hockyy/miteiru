// node scripts/data/buildJyutpingData.mjs <to-jyutping 3.1.1 checkout>/src/trie.txt
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {constants, zstdCompressSync} from 'node:zlib';

const source = fs.readFileSync(process.argv[2]);
if (createHash('sha256').update(source).digest('hex') !== '4995ec440243d468a4c816697e7fd9a87b8efbb90e54db119deb78c829a87729') {
  throw new Error('Expected the original to-jyutping 3.1.1 trie.txt');
}
fs.writeFileSync(new URL('../../native/rust/crates/miteiru-jyutping/trie.txt.zst', import.meta.url),
  zstdCompressSync(source, {params: {[constants.ZSTD_c_compressionLevel]: 19}}));
