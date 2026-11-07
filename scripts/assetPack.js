/*
 * Writes an asset pack: many small files in one file, so an installer unpacks one file instead of
 * thousands. The format (v1) is documented once, in main/helpers/assetPack.ts, next to the reader.
 */
const fs = require('node:fs');

const MAGIC = 'MTRPACK1';

/** entries: [name, gzippedBytes] pairs. Names are sorted in the index; each entry is one gzip stream. */
const writeAssetPack = (packPath, entries) => {
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const index = {};
  let offset = 0;
  for (const [name, bytes] of sorted) {
    if (Object.hasOwn(index, name)) throw new Error(`Duplicate pack entry ${name}`);
    index[name] = [offset, bytes.length];
    offset += bytes.length;
  }
  const indexBytes = Buffer.from(JSON.stringify(index), 'utf8');
  const header = Buffer.alloc(12);
  header.write(MAGIC, 0, 'latin1');
  header.writeUInt32LE(indexBytes.length, MAGIC.length);
  fs.writeFileSync(packPath, Buffer.concat([header, indexBytes, ...sorted.map(([, bytes]) => bytes)]));
  return {files: sorted.length, bytes: 12 + indexBytes.length + offset};
};

module.exports = {writeAssetPack};
