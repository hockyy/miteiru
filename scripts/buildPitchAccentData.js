/**
 * Builds renderer/public/language-assets/japanese/pitch/accents.json
 * from the Kanjium database (https://github.com/mifunetoshiro/kanjium),
 * licensed CC BY-SA 4.0. The attribution is embedded in the output meta.
 *
 * Usage:
 *   node scripts/buildPitchAccentData.js [path-to-kanjidb.sqlite]
 *
 * When no path is given, the database is downloaded once into
 * scripts/.cache/kanjidb.sqlite and reused on later runs.
 * Requires Node >= 22.5 (node:sqlite).
 */
const fs = require('fs');
const path = require('path');
const {DatabaseSync} = require('node:sqlite');

const KANJIUM_DB_URL =
  'https://github.com/mifunetoshiro/kanjium/raw/master/data/kanjidb.sqlite';
const CACHE_PATH = path.join(__dirname, '.cache', 'kanjidb.sqlite');
const OUTPUT_PATH = path.join(
  __dirname,
  '../renderer/public/language-assets/japanese/pitch/accents.json',
);

const katakanaToHiragana = (text) =>
  text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

const ensureDatabase = async (dbPath) => {
  if (dbPath) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Kanjium database not found: ${dbPath}`);
    }
    return dbPath;
  }
  if (fs.existsSync(CACHE_PATH)) {
    return CACHE_PATH;
  }
  fs.mkdirSync(path.dirname(CACHE_PATH), {recursive: true});
  console.log(`Downloading ${KANJIUM_DB_URL} ...`);
  const response = await fetch(KANJIUM_DB_URL);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  fs.writeFileSync(CACHE_PATH, Buffer.from(await response.arrayBuffer()));
  return CACHE_PATH;
};

const extractAccents = (db) => {
  // word -> reading -> sorted unique accent positions
  const words = new Map();
  const tables = [
    {table: 'edict', wordColumn: 'kanji'},
    {table: 'jukugo', wordColumn: 'jukugo'},
    {table: 'compverbs', wordColumn: 'compverb'},
  ];

  for (const {table, wordColumn} of tables) {
    const rows = db
      .prepare(
        `SELECT ${wordColumn} AS word, reading, acc_pos FROM ${table} WHERE acc_pos != ''`,
      )
      .all();
    for (const row of rows) {
      const accent = Number.parseInt(row.acc_pos, 10);
      if (!Number.isInteger(accent) || accent < 0) continue;
      const word = String(row.word);
      const reading = katakanaToHiragana(String(row.reading));
      if (!words.has(word)) words.set(word, new Map());
      const readings = words.get(word);
      if (!readings.has(reading)) readings.set(reading, new Set());
      readings.get(reading).add(accent);
    }
  }
  return words;
};

const run = async () => {
  const dbPath = await ensureDatabase(process.argv[2]);
  const db = new DatabaseSync(dbPath, {readOnly: true});
  const words = extractAccents(db);
  db.close();

  const out = Object.create(null);
  let entryCount = 0;
  for (const [word, readings] of [...words.entries()].sort()) {
    const readingMap = Object.create(null);
    for (const [reading, accents] of [...readings.entries()].sort()) {
      readingMap[reading] = [...accents].sort((a, b) => a - b);
      entryCount += 1;
    }
    out[word] = readingMap;
  }

  const payload = {
    meta: {
      source: 'Kanjium (https://github.com/mifunetoshiro/kanjium)',
      license: 'CC BY-SA 4.0',
      generatedAt: new Date().toISOString().slice(0, 10),
      words: Object.keys(out).length,
      entries: entryCount,
    },
    words: out,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), {recursive: true});
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload));
  const sizeKb = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  console.log(
    `Wrote ${OUTPUT_PATH} (${sizeKb} KiB, ${payload.meta.words} words, ${entryCount} readings)`,
  );
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
