import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, beforeEach, mock, test} from "node:test";
import {clearTableCaches, get, openTable, scan} from "../main/helpers/dataTable";
import {writeTable} from "../scripts/data/writeTable";
import {FIXTURE_ENTRIES, FIXTURE_FIELDS} from "./helpers/dictionaryFixture";

const FIELDS = {dataset: "test/table", version: "1", codec: "text", source: {name: "Test", url: "https://example.test/", license: "CC0"}};

let directory: string;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-table-test-"));
});

after(async () => {
  await fs.rm(directory, {recursive: true, force: true});
});

beforeEach(() => {
  clearTableCaches();
  mock.restoreAll();
});

const text = (value: Buffer | null) => value?.toString("utf8");

/** 300 entries in reverse order; a few keys sort differently as UTF-8 bytes than as JS strings. */
const manyEntries = (): Array<[string, Buffer]> => {
  const keys = ["z", "é", "日", "a", "ab", "b", "😀", "\u{ffff}", ""];
  for (let i = 0; i < 291; i++) keys.push(`k${String(i).padStart(4, "0")}`);
  return keys.map((key, i): [string, Buffer] => [key, Buffer.from(`value of ${key} ${"x".repeat(i % 50)}`)]).reverse();
};

const bytewise = (keys: string[]) => [...keys].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));

const build = (name: string, entries = manyEntries(), blockBytes = 600) => {
  const file = path.join(directory, name);
  const written = writeTable(file, FIELDS, entries, {blockBytes, level: 3});
  return {file, written, entries};
};

/** Counts the file reads (handle.read calls) and opens made through fs/promises while the test runs. */
const countIo = () => {
  const counts = {opens: 0, reads: 0};
  const open = fs.open.bind(fs);
  mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    counts.opens++;
    const handle = await open(...args);
    const read = handle.read.bind(handle) as (...a: unknown[]) => Promise<unknown>;
    (handle as unknown as { read: unknown }).read = (...a: unknown[]) => {
      counts.reads++;
      return read(...a);
    };
    return handle;
  });
  return counts;
};

test("a table reads back every entry across blocks, and the header records provenance", async () => {
  const {file, written, entries} = build("round.pack");
  assert.ok(written.blocks > 5, `${written.blocks} blocks`);
  assert.equal((await fs.readFile(file)).subarray(0, 8).toString("latin1"), "MTRPACK2");
  const {header} = await openTable(file);
  assert.equal(header.format, 2);
  assert.equal(header.compression, "zstd");
  assert.equal(header.entries, entries.length);
  assert.deepEqual(header.source, FIELDS.source);
  assert.equal(header.blocks.length, written.blocks);
  for (const [key, value] of entries) assert.equal(text(await get(file, key)), value.toString(), key);
});

test("keys sort by their UTF-8 bytes, not as JavaScript strings", async () => {
  const keys = ["z", "é", "日", "😀", "\u{ffff}", "a"];
  assert.notDeepEqual([...keys].sort(), bytewise(keys), "the fixture must tell the two orders apart");
  const {file} = build("order.pack", keys.map((key): [string, Buffer] => [key, Buffer.from(key)]), 1);
  assert.deepEqual((await scan(file)).map(([key]) => key), bytewise(keys));
});

test("get gives null for a missing key, before, between and after the keys", async () => {
  const {file} = build("missing.pack");
  for (const key of ["k9999", "k0000x", "\u0001", "zzz", "ü"]) assert.equal(await get(file, key), null, key);
});

test("scan honours gte, lt, prefix and limit across block boundaries", async () => {
  const {file, entries} = build("scan.pack");
  const sorted = bytewise(entries.map(([key]) => key as string));
  const keys = async (options: Parameters<typeof scan>[1]) => (await scan(file, options)).map(([key]) => key);
  assert.deepEqual(await keys({}), sorted);
  assert.deepEqual(await keys({gte: "k0100", lt: "k0200"}), sorted.filter((key) => key >= "k0100" && key < "k0200"));
  assert.equal((await keys({gte: "k0100", lt: "k0200"})).length, 100);
  assert.deepEqual(await keys({prefix: "k02"}), sorted.filter((key) => key.startsWith("k02")));
  assert.deepEqual(await keys({prefix: "k02", lt: "k0210"}), sorted.filter((key) => key.startsWith("k02") && key < "k0210"));
  assert.deepEqual(await keys({prefix: "k0", gte: "k0290"}), sorted.filter((key) => key.startsWith("k0") && key >= "k0290"));
  assert.deepEqual(await keys({gte: "k0250", limit: 7}), sorted.filter((key) => key >= "k0250").slice(0, 7));
  assert.deepEqual(await keys({prefix: "日"}), ["日"]);
  assert.deepEqual(await keys({prefix: "\u{ffff}"}), ["\u{ffff}"]);
  assert.deepEqual(await keys({prefix: "nothing"}), []);
  assert.deepEqual(await keys({gte: "z", lt: "a"}), []);
  assert.deepEqual(await keys({limit: 0}), []);
  const [first] = await scan(file, {gte: "k0003", limit: 1});
  assert.equal(first[1].toString(), entries.find(([key]) => key === "k0003")?.[1].toString());
});

test("an empty table opens and answers nothing", async () => {
  const {file} = build("empty.pack", []);
  assert.equal(await get(file, "a"), null);
  assert.deepEqual(await scan(file), []);
});

test("duplicate keys and keys that are not UTF-8 are rejected, and nothing is written", async () => {
  const file = path.join(directory, "dupes.pack");
  assert.throws(() => writeTable(file, FIELDS, [["a", Buffer.from("1")], ["b", Buffer.from("2")], [Buffer.from("a"), Buffer.from("3")]]), /Duplicate table key "a"/);
  assert.throws(() => writeTable(file, FIELDS, [[Buffer.from([0xff, 0xfe]), Buffer.from("1")]]), /not valid UTF-8/);
  await assert.rejects(fs.access(file));
});

test("a table that is not one, or is damaged, is rejected with a clear message", async () => {
  const {file} = build("damage.pack");
  const good = await fs.readFile(file);
  const rewrite = async (name: string, bytes: Buffer) => {
    const damaged = path.join(directory, name);
    await fs.writeFile(damaged, bytes);
    return damaged;
  };
  const headerLength = good.readUInt32LE(8);
  const mutate = (change: (header: any) => void) => {
    const header = JSON.parse(good.subarray(12, 12 + headerLength).toString("utf8"));
    change(header);
    const bytes = Buffer.from(JSON.stringify(header));
    const preamble = Buffer.from(good.subarray(0, 12));
    preamble.writeUInt32LE(bytes.length, 8);
    return Buffer.concat([preamble, bytes, good.subarray(12 + headerLength)]);
  };

  await assert.rejects(get(await rewrite("magic.pack", Buffer.from("MTRPACK1\0\0\0\0{}")), "a"), /bad magic/);
  await assert.rejects(get(await rewrite("short.pack", Buffer.from("MTR")), "a"), /too short/);
  const longHeader = Buffer.from(good.subarray(0, 12));
  longHeader.writeUInt32LE(1e6, 8);
  await assert.rejects(get(await rewrite("long.pack", longHeader), "a"), /does not fit/);
  const brokenJson = Buffer.concat([good.subarray(0, 8), Buffer.from([4, 0, 0, 0]), Buffer.from("{{{{")]);
  await assert.rejects(get(await rewrite("json.pack", brokenJson), "a"), /unreadable header/);
  await assert.rejects(get(await rewrite("format.pack", mutate((h) => { h.format = 3; })), "a"), /unsupported format 3/);
  await assert.rejects(get(await rewrite("bounds.pack", mutate((h) => { h.blocks[0][2] = 1e9; })), "a"), /outside the file/);
  await assert.rejects(get(await rewrite("count.pack", mutate((h) => { h.entries += 1; })), "a"), /do not add up/);
  await assert.rejects(get(await rewrite("sorted.pack", mutate((h) => { h.blocks.reverse(); })), "a"), /out of order/);

  // A damaged block fails when it is read; the table's other blocks still read.
  const bytes = Buffer.from(good);
  bytes.fill(0xaa, 12 + headerLength + 2, 12 + headerLength + 20);
  const garbled = await rewrite("block.pack", bytes);
  await assert.rejects(get(garbled, "a"), /does not decompress/);
  const {header} = await openTable(garbled);
  const lastKey = header.blocks.at(-1)![0];
  assert.equal(text(await get(garbled, lastKey))?.startsWith("value of"), true);
  // A block with the wrong number of entries is caught too.
  await assert.rejects(get(await rewrite("entries.pack", mutate((h) => { h.blocks[0][3] += 1; h.entries += 1; })), "a"), /holds \d+ entries, not \d+/);
});

test("a missing file rejects with ENOENT, and is opened once it exists", async () => {
  const file = path.join(directory, "later.pack");
  await assert.rejects(get(file, "a"), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  await assert.rejects(scan(file), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  writeTable(file, FIELDS, [["a", Buffer.from("A")]]);
  assert.equal(text(await get(file, "a")), "A");
});

test("a second get in the same block does not read the file again", async () => {
  const {file} = build("cache.pack", manyEntries(), 100000);
  const io = countIo();
  assert.equal(text(await get(file, "k0001"))?.startsWith("value of k0001"), true);
  const afterFirst = io.reads;
  assert.ok(afterFirst >= 3, "preamble, header and block");
  assert.equal(text(await get(file, "k0002"))?.startsWith("value of k0002"), true);
  assert.equal(text(await get(file, "k0001"))?.startsWith("value of k0001"), true);
  assert.equal(io.reads, afterFirst, "same block: no further read");
  // Concurrent readers of a cold block share one read.
  clearTableCaches();
  io.reads = 0;
  await Promise.all([get(file, "k0001"), get(file, "k0002"), get(file, "k0003")]);
  assert.equal(io.reads, afterFirst);
});

test("only the most recently used blocks stay cached", async () => {
  const {file, written} = build("lru.pack", manyEntries(), 300);
  assert.ok(written.blocks > 12);
  await get(file, "k0000");
  const io = countIo();
  io.opens = 0;
  await get(file, "k0000");
  assert.equal(io.opens, 0, "still cached");
  for (let i = 0; i < 291; i += 3) await get(file, `k${String(i).padStart(4, "0")}`);
  io.opens = 0;
  await get(file, "k0000");
  assert.equal(io.opens, 1, "evicted, read again");
});

// The Rust reader (src-tauri/src/sys/table.rs) reads this same file in its unit tests.
const FIXTURE = path.join(__dirname, "fixtures", "dictionary-fixture.pack");

test("the committed fixture table reads back as listed, and the writer still produces it", async () => {
  const {header} = await openTable(FIXTURE);
  assert.equal(header.dataset, FIXTURE_FIELDS.dataset);
  assert.ok(header.blocks.length >= 3);
  assert.deepEqual((await scan(FIXTURE)).map(([key, value]) => [key, value.toString()]), FIXTURE_ENTRIES);
  for (const [key, value] of FIXTURE_ENTRIES) assert.equal(text(await get(FIXTURE, key)), value, key);
  const rewritten = path.join(directory, "fixture-again.pack");
  writeTable(rewritten, FIXTURE_FIELDS, FIXTURE_ENTRIES.map(([key, value]): [string, Buffer] => [key, Buffer.from(value)]), {blockBytes: 80});
  assert.deepEqual(await fs.readFile(rewritten), await fs.readFile(FIXTURE));
});
