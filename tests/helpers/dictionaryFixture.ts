/**
 * The entries of tests/fixtures/dictionary-fixture.pack, a table written by scripts/data/writeTable.ts
 * (blockBytes 80, so it has several blocks). tests/dataTable.test.ts reads it with the JS reader and
 * the unit tests in src-tauri/src/sys/table.rs read it with the Rust one, so the two cannot drift
 * apart. Change the entries and both must change: regenerate the file with
 *   npx tsx <script that calls writeTable(path, FIXTURE_FIELDS, entries, {blockBytes: 80})>
 * and update the expected list in table.rs `reads_the_fixture_written_by_the_js_writer`.
 */
export const FIXTURE_FIELDS = {
  dataset: "test/dictionary-fixture",
  version: "1",
  codec: "text",
  source: {name: "Test", url: "https://example.test/", license: "CC0"}
};

/** In key (UTF-8 byte) order. */
export const FIXTURE_ENTRIES: Array<[string, string]> = [
  ["", "empty key"],
  ["a", "first"],
  ["ab", "second"],
  ["empty", ""],
  ["indexes/kana/なる-1", "1"],
  ["indexes/kana/なる-2", "2"],
  ["indexes/kanji/成る-1", "1"],
  ["raw/words/1", "{\"id\":\"1\",\"kanji\":[{\"text\":\"成る\"}]}"],
  ["z", "last ascii"],
  ["é", "accented"],
  ["日", "han"],
  ["😀", "astral"]
];
