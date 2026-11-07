# Data format: MTRPACK2

Miteiru ships big read-only data (stroke-order SVGs and the four dictionaries, see [#139](https://github.com/hockyy/miteiru/issues/139)) in one container format, `MTRPACK2`: a **sorted key-value table** in zstd blocks. A reader asks for one key (or a range of keys) and reads one block of the file, so nothing is unpacked or imported first, and the installer holds a few files instead of thousands. Adding a dataset is described in [ADDING_DATA.md](ADDING_DATA.md).

The code:

| What | Where |
| --- | --- |
| Reader (`openTable`, `get`, `scan`) | `main/helpers/dataTable.ts` |
| Writer (`writeTable`) | `scripts/data/writeTable.ts` |
| Codecs (`text`, `mmah-svg-1`) | `main/helpers/dataCodecs.ts` |
| Stroke tables build | `scripts/data/buildStrokePacks.ts`, run by `scripts/compressLanguageAssets.js` while staging |
| Dictionary tables build | `scripts/data/buildDictionaryTables.ts`, run by the same script |
| Native reader (dictionaries) | `src-tauri/src/sys/table.rs` (commands `table_open`, `table_close`, `table_get_many`, `table_values`), `openReadOnlyTable` in `renderer/platform/backend/shims/level.ts` |
| Inspect a table | `scripts/data/inspectTable.ts` |
| zstd in the app | `src-tauri/src/sys/zstd.rs` (command `zstd_decompress`), `renderer/platform/backend/shims/zlib.ts` |

## File layout

All integers are little-endian.

| Bytes | Content |
| --- | --- |
| 0-7 | ASCII `MTRPACK2` |
| 8-11 | `H`, the header length in bytes (u32) |
| 12 to 12+`H` | the header: UTF-8 JSON |
| from 12+`H` | the data section: the blocks, one after the other |

Block offsets in the header count from the start of the data section (byte 12+`H`).

## Header

```json
{
  "format": 2,
  "dataset": "han-character-core/hanzi",
  "version": "1.0.0",
  "codec": "mmah-svg-1",
  "compression": "zstd",
  "source": {"name": "Make Me a Hanzi", "url": "https://github.com/skishore/makemeahanzi", "license": "Arphic Public License and LGPL"},
  "entries": 9574,
  "blocks": [["00041.svg", 0, 61234, 52], ["0004e.svg", 61234, 60871, 49]]
}
```

- `format`: the container version, `2`. A reader refuses any other.
- `dataset`: an id for what the table holds, by convention `<plugin>/<name>`.
- `version`: the version of the data, free text. It records which source release was packed.
- `codec`: how a value turns into what the app reads (below).
- `compression`: `zstd`, the only one so far.
- `source`: where the data comes from: its `name`, `url` and `license`. Credits for the app are taken from here.
- `entries`: the number of entries. It must equal the sum of the block entry counts.
- `blocks`: one `[first key, offset, compressed length, entry count]` per block, in key order. The first key is the key of the block's first entry (JSON text, so keys must be valid UTF-8).

## Entries and order

An entry is a (key, value) pair. Keys are unique and sorted by their **UTF-8 bytes** (`Buffer.compare` order), not by JavaScript string order: the two differ for characters outside the Basic Multilingual Plane against high BMP characters (U+FFFF sorts after U+1F600 as a JS string, before it as bytes). Byte order is also SQLite's `BINARY` collation, which today's key-value store (`src-tauri/src/sys/kv.rs`) uses, so a table iterates in the order the dictionary code already expects.

Values are bytes; what they mean is up to the codec.

## Blocks

A block holds consecutive entries, about 128 KB of raw data (`blockBytes` in `writeTable`; a block closes once it reaches that size, so it is a little over). Each block is one zstd frame, written at level 19. Decompressed, a block is a repeated

```
[u32 key length][key bytes][u32 value length][value bytes]
```

with the keys ascending. Compression across many entries is where the savings come from: one stroke SVG is too small to compress well alone, 50 of them are not.

## Reading

```ts
import {get, scan} from "main/helpers/dataTable";

const value = await get(path, "065e5.svg");           // Buffer | null
const rows = await scan(path, {prefix: "raw/words/", limit: 20}); // [key, Buffer][], in key order
```

- `openTable(path)` parses and validates the header once per path and caches it; a failed open is not cached, so a later call tries again.
- A lookup binary-searches the blocks' first keys, reads that block with one ranged read (`fs.promises.open` and `handle.read`, which in the app is the worker's fs shim and the Rust command `fs_read_range`), decompresses it with `zlib.zstdDecompress`, and keeps about 8 decoded blocks per process (LRU). Concurrent readers of one block share the read.
- `scan({gte, lt, prefix, limit})` returns the entries in key order, reading the blocks it needs.
- `get` and `scan` return copies; the cache is never exposed.
- A corrupt table (bad magic, header, block bounds, a block that does not decompress or has the wrong entry count) rejects with a clear message. A missing file rejects with the `ENOENT` error of `open`, so callers can fall back, as `readStrokeSvg` does to loose files in development.

### zstd in the app

The app runs this code in a worker whose `node:zlib` is a shim over the browser's `DecompressionStream`, which has no zstd. The shim's `zstdDecompress(data, callback)` (same callback shape as `gunzip`) sends the compressed bytes to the Rust command `zstd_decompress` as a raw IPC body, like `kv_batch`, and gets the bytes back as a raw response. The Rust side (`src-tauri/src/sys/zstd.rs`) uses the `zstd` crate and refuses an output over 64 MiB, so a corrupt block cannot fill memory. A new Rust command is registered in `src-tauri/build.rs`, `src-tauri/permissions/app-commands.toml`, `src-tauri/permissions/autogenerated/` and `src-tauri/src/lib.rs`.

In Node (tests, build scripts) the same code uses Node's own `zlib.zstdDecompress`. That needs **Node 22.15 or newer**, which `engines.node` requires; the experimental-feature warning on 22.x is harmless.

## Writing

```ts
import {writeTable} from "../scripts/data/writeTable";

writeTable("out/set.pack", {dataset, version, codec: "text", source}, entries /* [key, Buffer][] */);
```

`writeTable` sorts by key bytes, rejects duplicate keys and keys that are not valid UTF-8, packs the blocks, compresses each with `zlib.zstdCompressSync` at level 19, and writes the file. It fills in `format`, `compression`, `entries` and `blocks`. Run TypeScript build scripts with `tsx` (a dev dependency): `npx tsx scripts/data/<script>.ts`.

## Dictionary tables

JMdict, KANJIDIC, CC-CEDICT and CantoDict ship as tables with the `text` codec, beside where their JSON would be: `japanese/dict/jmdict.pack`, `japanese/dict/kanjidic.pack`, `mandarin/chinese/chinese.pack`, `cantonese/cantonese/cantodict.pack`. The keys are the ones the dictionaries' import has always written into the store, so every lookup returns what it returned from SQLite:

| Dictionary | Keys |
| --- | --- |
| JMdict | `raw/words/<id>` (word JSON), `indexes/kana/<text>-<id>` and `indexes/kanji/<text>-<id>` (value: the id), `raw/tags`, `raw/dictRevisions`, `raw/dictDate`, `raw/version` |
| KANJIDIC | `raw/characters/<literal>` (character JSON), `raw/dictDate`, `raw/version` |
| CC-CEDICT, CantoDict | `raw/words/<id>`, `raw/char/<id>` (entry JSON), `indexes/<form>-<id>` and `partial/<substring>-<id>` (value: the word id), `indexchar/<content>-<id>` (value: the character id), `raw/version` |
| all | `raw/miteiruDictionaryFormat` = `1`: a table without it is broken and refused |

Each dictionary module exports its import definition (`jmdictImport`, `kanjidicImport`, `chineseImport` in `main/dictionary/`), whose `writeEntries(raw, writer)` is the single definition of the keys. Development and the tests run it against a `level` store; the build runs it with a collecting writer, adds the metadata and the format marker, and writes the table with blocks of 256 KB (`blockBytes: 262144`: JMdict is 13.95 MB at 256 KB against 14.45 at 128 KB; a shared zstd dictionary gained only 1 to 4% and is not used). The header's `dataset` is `japanese/jmdict`, `japanese/kanjidic`, `mandarin/cc-cedict` or `cantonese/cantodict`, its `version` the file's version and date, and `source` its credit. The build then reads every entry back through the JS reader and fails on any difference.

`openDictionary` (`main/dictionary/levelDictionary.ts`) looks for the table first (the import path with `.json` replaced by `.pack`). With a table there is no import and no SQLite copy; without one (development, tests) the JSON is imported as before, rebuilding from an empty store. Opening a table also deletes the dictionary's old caches (the 7.x LevelDB folder at its store path, and `<store>.sqlite3` with `-wal` and `-shm`), never any other store.

### The native reader

Glossing a subtitle file asks for every distinct word in it, each needing several prefix scans and record fetches, so a worker-side reader (one IPC call and one decompression per block) would be far too slow. `src-tauri/src/sys/table.rs` serves a query in one call:

| Command | |
| --- | --- |
| `table_open(path) -> handle` | parses and validates the header and block index once; refcounted per path |
| `table_close(handle)` | drops one reference; the last closes the file |
| `table_get_many(handle, keys) -> (string or null)[]` | values in the order of the keys, null for a missing key |
| `table_values(handle, gte, lt, limit) -> string[]` | values (no keys) of the keys in `[gte, lt)` in key order; a `limit` below 0 means all, 0 none |

It validates what the JS reader does (magic, header, block bounds and order, entry counts, order inside each block) and reads blocks with positional reads (`seek_read` on Windows, `read_at` elsewhere), so concurrent queries never contend on a file position. Blocks are decompressed with the `zstd` crate into one LRU shared by all tables, with a budget of about 32 MB of decoded data. `table_get_many` groups its keys by block, so each block is read once per call. The worker side is `openReadOnlyTable(path)` in `renderer/platform/backend/shims/level.ts`, whose `get`, `getMany`, `values({gte, lt, limit}).all()` and `close` return what `Level` returns. In Node (tests, build) `levelDictionary.ts` wraps `main/helpers/dataTable.ts` instead.

Both readers are tested against one committed table, `tests/fixtures/dictionary-fixture.pack` (written by `writeTable`; its entries are in `tests/helpers/dictionaryFixture.ts`), so they cannot drift apart.

## Codecs

A codec has an `id`, `encode(text) -> Buffer` for the build and `decode(Buffer) -> text` for the app. The table header names it; `codecFor(id)` finds it. The build checks `decode(encode(text)) === text` for every file.

### `text`

The value is the file's UTF-8 text. KanjiVG uses it: its files are already minified.

### `mmah-svg-1`

Make Me a Hanzi's stroke SVGs are one generator's output, so only what differs between characters is stored and decode rebuilds the exact text from a template. Per stroke the file has an outline path (twice: as a `fill="lightgray"` path and inside a `<clipPath>`), a median path with `stroke-dasharray`, and a CSS `@keyframes` block plus `#make-me-a-hanzi-animation-N` block with a few numbers. The template, in `main/helpers/dataCodecs.ts`, is the fixed grid and style header, one animation block per stroke, one lightgray outline per stroke, one clip block per stroke, and the closing tags.

A value is:

- byte 0 `0x01` (structured), then one line per stroke, tab-separated, trailing empty fields left out: outline, median, dasharray, dashoffset, percentage, duration, delay. Each is the text the file writes.
- byte 0 `0x00` (fallback), then the original file's text, for a file whose exact text the template does not reproduce.

The generator computes the numbers from the median's length, and a field that equals what its rule gives is left empty. Over all 9,574 characters (112,617 strokes) the rules hold for every dasharray (`"L 2L"`), dashoffset (`L + 128`), percentage (`round(100 * dashoffset / (dashoffset + 307.2))`) and delay (previous delay plus previous duration), and for all but 18 durations (`(5 * dashoffset + 1536) / 6144`, float rounding); those 18 are stored as written. Nothing is rounded or recomputed beyond what the encoder has compared with the file. If a file does not round-trip at all, it is stored with the fallback form; the build reports how many (0 today).

## Inspecting a table

```
npx tsx scripts/data/inspectTable.ts src-tauri/resources/language-assets/han-character-core/hanzi.pack
npx tsx scripts/data/inspectTable.ts src-tauri/resources/language-assets/han-character-core/hanzi.pack 26085.svg
```

The first form prints the header summary (dataset, version, codec, source, entry and block counts); with a key it also prints that entry's decoded value. `node scripts/stageTauriResources.mjs` creates the packaged tables.

## Versioning rules

- Bump `format` for a change to the container (layout, header meaning, block layout) that an old reader would misread. Readers refuse formats they do not know.
- Bump the codec id (`mmah-svg-1` to `mmah-svg-2`) for a change that old values would not decode under. Keep the old codec in `dataCodecs.ts` only while shipped tables use it; unreleased formats can simply be replaced.
- `version` in the header is the data's own version and changes with the data, not the format.
- Keys are part of a dataset's contract with its reader: renaming a key scheme is a new `dataset` version for that reader.

## Sizes

Dictionaries are larger than the gzipped JSON they replace by a few MB each (JMdict 9.59 MB gzipped, about 14 MB as a table), in exchange for no import, no 250 to 310 MB SQLite copy in the profile and no first-load wait.

Staged on Windows, from the full language assets: `kanji.pack` 3.59 MiB (was 6.83 as per-file gzip) and `hanzi.pack` 10.93 MiB (was 24.38). The staged resources hold a few dozen files instead of 21,315.
