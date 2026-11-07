# Adding a dataset

How to ship a new read-only dataset (stroke data, a word list, example sentences) in Miteiru. The container is described in [DATA_FORMAT.md](DATA_FORMAT.md); read that first for what a table is.

## 1. Put the source in the language assets

Sources live in `renderer/public/language-assets/<plugin>/…`, next to the plugin's `asset-manifest.json`. They are not committed: `npm run script:download-language-assets` fetches them from the assets release into that folder, so a new dataset means uploading its files to that release (and listing them in the plugin's `asset-manifest.json`). In development the app can read the loose files; packaged builds read a table built from them.

## 2. Add a build entry

Staging (`node scripts/stageTauriResources.mjs`, part of `npm run tauri:build`) copies the language assets and calls `compressLanguageAssets` (`scripts/compressLanguageAssets.js`), which runs `scripts/data/buildStrokePacks.ts` through `tsx`. A dataset needs an entry like the ones in `STROKE_SETS` in that file:

```ts
{
  folder: "kanji",                 // the source folder; the table is "<folder>.pack" beside it
  codec: "text",                   // how a source file becomes a value (below)
  fields: {
    dataset: "han-character-core/kanji",   // the dataset id: <plugin>/<name>
    version: "1.0.0",                      // the version of the data you packed
    source: {name: "KanjiVG", url: "https://kanjivg.tagaini.net/", license: "CC BY-SA 3.0"}
  }
}
```

Decide, for each dataset:

- **The dataset id**, a stable name; readers and the header both carry it.
- **The source files** the build reads, and which names count (`READABLE_NAME` for the stroke sets; the stroke build leaves out files nothing can ask for).
- **The key of each entry.** For files it is the file name (`065e5.svg`); for records it is whatever the reader will ask for. Keys are UTF-8 and sort by bytes, so prefixes group related records and a `scan({prefix})` reads them in order (the dictionaries will use `raw/words/{id}`, `indexes/kana/{text}-{id}` and so on). Keys must be unique.
- **The codec.** `text` stores a file's text as it is. For a generated or repetitive format, add a codec to `main/helpers/dataCodecs.ts`: `encode(text)` and `decode(value)` with a new id such as `my-format-1`, and register it in `CODECS`. Store only what varies and rebuild the rest from a template, as `mmah-svg-1` does, but keep the whole-file fallback: a file the codec cannot reproduce exactly is stored as plain text.
- **The block size.** The default of about 128 KB suits entries up to a few KB; pass `blockBytes` to `writeTable` for very small or very large values.

The build writes the table with `writeTable` (`scripts/data/writeTable.ts`) and removes the source folder from the staged copy. The installer then ships one file.

## 3. Read it at runtime

Reading is plain Node API code in `main/`, so it also runs in tests:

```ts
import {codecFor} from "./dataCodecs";
import {get, openTable} from "./dataTable";

const table = directory + ".pack";
const value = await get(table, key);                    // null when the key is not there
const text = value ? codecFor((await openTable(table)).header.codec).decode(value) : "";
```

`get` rejects with `ENOENT` when the table does not exist, which is how development (loose source files) and tests fall back; any other error means a damaged table. `main/helpers/strokeSvg.ts` is the worked example: a name check, the table, the codec, then the loose-file fallback. A dataset read a record at a time (stroke SVGs) needs no Rust command: the worker already reads ranges (`fs_read_range`) and decompresses (`zstd_decompress`). A dataset queried hot, many times a second with range scans (the dictionaries, when glossing a subtitle file), needs the native reader (`table_get_many` and `table_values` in `src-tauri/src/sys/table.rs`), reached through `openReadOnlyTable` in `renderer/platform/backend/shims/level.ts`; another table needs no new command.

## 4. Verify it

- **Round trip.** The build decodes every value it encodes and compares it with the source file, and fails when they differ. Report how many files used a codec's fallback (the stroke build prints it per table); aim for 0.
- **Byte-identical reads.** After `node scripts/stageTauriResources.mjs`, read every source file back through the reader and compare it with the loose file. `tests/strokeSvg.test.ts` does it for a few files; for a whole dataset, write a one-off script that loops over the source folder.
- **Tests.** Add the codec's tests next to `tests/dataCodecs.test.ts` (real small files as fixtures in `tests/fixtures/`, the fallback path, unknown values), and a test for the reader function like the ones in `tests/strokeSvg.test.ts` (table preferred, loose files as the fallback, bad names refused). `npm test` runs them.
- **Smoke test.** `renderer/platform/smokeTest.ts` runs in the packaged app (`MITEIRU_SMOKE_TEST`) and already reads stroke data from both tables, which exercises the Rust zstd command end to end. Add a read of your dataset there so CI covers it on macOS and Linux.
- **Look at it.** `npx tsx scripts/data/inspectTable.ts <file.pack> [key]` prints the header and one decoded value.

## 5. Licence and attribution

Every table's header records `source.name`, `source.url` and `source.license`, and the licence must allow redistribution in the installer. Also add the dataset to the credits in `README.md` ("Credits and license"), and keep any licence text the source requires beside the data. Do not pack a dataset whose licence you have not checked.

## Adding a dictionary

The four bundled dictionaries are tables whose keys are what their import writes (see [DATA_FORMAT.md](DATA_FORMAT.md), "Dictionary tables"). To add one:

1. Write its **import definition** next to the others in `main/dictionary/` and export it, as `jmdictImport` is: `metadataKeys` (written last; their presence marks a complete store), `writeEntries(raw, writer)` (every `writer.put(key, value)` of the keys the queries read) and `metadata(raw)`. `setupX` calls `openDictionary(dbPath, importPath, xImport)`. The queries use only `get`, `getMany`, `values({gte, lt, limit})` and `close`, the `DictionaryDb` interface.
2. Add **one entry** to `DICTIONARIES` in `scripts/data/buildDictionaryTables.ts`: the JSON's path under `language-assets`, the import definition, the dataset id and the source (name, link, licence; credit it in `README.md` too). Staging then writes `<name>.pack` beside the JSON, verifies it against the import and removes the JSON.
3. Make the app's `importPath` the JSON path (as `main/handler/japanese.ts` does); `openDictionary` finds the `.pack` beside it. Test it by building a table from a small fixture with `buildDictionaryTable` and comparing it with the imported store, as `tests/dictionaryTables.test.ts` does.
4. Add a real lookup to `checkLanguages` in `renderer/platform/smokeTest.ts`.

Development (the JSON, no table) still imports into a store on first load. The Rust importer in `src-tauri/src/sys/dict_import.rs` (`nativeLayout`) only speeds that up for the three existing layouts; a new dictionary does not need it.

## What comes next

VNEDICT is still gzipped text, and a converter to the Universal Dictionary schema (`main/dictionary/dictionary.schema.json`) would let new dictionaries share one import. Phase 3 of [#139](https://github.com/hockyy/miteiru/issues/139) compresses the tokenizer data (kuromoji `.dat`, jieba).
