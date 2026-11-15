// Stages this checkout's downloaded language data (renderer/public/language-assets, which
// `npm run script:initrepo` downloads) for the headless server, in the form an installed language pack
// holds it: dist/headless/language-assets/<plugin>/…. A development checkout keeps its dictionaries as
// JSON, which only the app imports, so each becomes its data table (scripts/data/buildDictionaryTables.ts,
// the release's own builder). Every other file is a hard link to the checkout's (a copy where a link
// can't be made), so the stage costs almost no disk. The headless server reads it after the installed
// language packs: a language the learner's Miteiru has no pack for is read from this checkout.
//
//   node scripts/stageHeadlessData.mjs      stage when the checkout's data changed since the last run
//   node scripts/stageHeadlessData.mjs -f   stage anyway
//
// Progress goes to stderr; stdout stays free (scripts/miteiru-mcp.mjs runs this before serving MCP on it).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(root, 'renderer', 'public', 'language-assets');
export const HEADLESS_DATA = path.join(root, 'dist', 'headless', 'language-assets');
const STAMP = `${HEADLESS_DATA}.stamp.json`;
const STAMP_FORMAT = 1;

/** Staged files nothing in main/ reads (the page fetches them from its own export), and Finder litter. */
const EXCLUDED_PREFIXES = ['japanese/pitch/', 'japanese/grammar/'];
const IGNORED_NAMES = new Set(['.DS_Store']);
const MANIFEST = 'asset-manifest.json';

/** The JSON dictionaries the builder turns into tables, as scripts/data/buildDictionaryTables.ts lists them. */
const DICTIONARY_JSON = ['japanese/dict/jmdict.json', 'japanese/dict/kanjidic.json', 'mandarin/chinese/chinese.json', 'cantonese/cantonese/cantodict.json'];
const tableFor = (jsonPath) => jsonPath.replace(/\.json$/, '.pack');

/** What the staged tables are made by: a change to any of these stages again. */
const BUILDER_FILES = [
  'scripts/stageHeadlessData.mjs',
  'scripts/data/buildDictionaryTables.ts',
  'scripts/data/writeTable.ts',
  'main/dictionary/levelDictionary.ts',
  'main/dictionary/jmdictDb.ts',
  'main/dictionary/kanjidicDb.ts',
  'main/dictionary/chineseDictionaryDb.ts'
];

const log = (message) => process.stderr.write(`[stageHeadlessData] ${message}\n`);

const isDirectory = (file) => {
  try {
    // statSync follows junctions and symbolic links, as a checkout that links its data folders has them.
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The stroke-order folders: 21,000 small files that change only with a new download. The quick check a
 * server start makes looks at these folders' own times instead of every file in them.
 */
const BULK_DIRECTORIES = new Set(['han-character-core/hanzi', 'han-character-core/kanji']);

/**
 * Every data file under the checkout's language-assets as [relative path, size, mtime], sorted. With
 * `quick`, a bulk folder is one [path + "/", -1, its mtime] entry (about 20 stats instead of 21,000).
 */
export const sourceFiles = (source = SOURCE, {quick = false} = {}) => {
  const found = [];
  const walk = (directory, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(full))) {
        if (quick && BULK_DIRECTORIES.has(relative)) {
          found.push([`${relative}/`, -1, Math.floor(fs.statSync(full).mtimeMs)]);
          continue;
        }
        walk(full, relative);
        continue;
      }
      if (EXCLUDED_PREFIXES.some((excluded) => relative.startsWith(excluded))) continue;
      const stat = fs.statSync(full);
      if (stat.isFile()) found.push([relative, stat.size, Math.floor(stat.mtimeMs)]);
    }
  };
  walk(source, '');
  // A plugin counts only once its data was downloaded: its manifest alone (which git tracks) is nothing.
  const downloaded = new Set(found.filter(([relative]) => !relative.endsWith(`/${MANIFEST}`)).map(([relative]) => relative.split('/')[0]));
  return found.filter(([relative]) => downloaded.has(relative.split('/')[0])).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
};

const builderStamp = () => BUILDER_FILES.map((file) => {
  try {
    const stat = fs.statSync(path.join(root, file));
    return [file, stat.size, Math.floor(stat.mtimeMs)];
  } catch {
    return [file, -1, -1];
  }
});

const stampFor = (files, quickFiles) => ({format: STAMP_FORMAT, builder: builderStamp(), quick: quickFiles, files});

/** The plugins whose data was downloaded into this checkout. */
export const downloadedPlugins = (files = sourceFiles()) => [...new Set(files.map(([relative]) => relative.split('/')[0]))];

const readStamp = () => {
  try {
    return JSON.parse(fs.readFileSync(STAMP, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Whether the stage differs from the checkout's data, or was never made while there is data to stage.
 * `quick` compares the bulk stroke folders by their own times (what a server start can afford).
 */
export const headlessDataIsStale = ({quick = false, files = sourceFiles(SOURCE, {quick})} = {}) => {
  const stored = readStamp();
  if (files.length === 0) return stored !== null || fs.existsSync(HEADLESS_DATA);
  if (!stored || !fs.existsSync(HEADLESS_DATA)) return true;
  const expected = stampFor(quick ? [] : files, quick ? files : []);
  return JSON.stringify(stored.builder) !== JSON.stringify(expected.builder)
    || stored.format !== STAMP_FORMAT
    || JSON.stringify(quick ? stored.quick : stored.files) !== JSON.stringify(quick ? files : expected.files);
};

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

/** Old stages (kept open by a server that ran meanwhile) and stagings of builds that died midway. */
const removeLeftovers = () => {
  const parent = path.dirname(HEADLESS_DATA);
  for (const name of fs.readdirSync(parent)) {
    const match = name.match(/^language-assets\.(old|staging)-(\d+)$/);
    if (!match || (match[1] === 'staging' && processAlive(Number(match[2])))) continue;
    try {
      fs.rmSync(path.join(parent, name), {recursive: true, force: true});
    } catch {
      // Still open in a running server on Windows: removed by a later build.
    }
  }
};

const link = (from, to) => {
  fs.mkdirSync(path.dirname(to), {recursive: true});
  try {
    fs.linkSync(from, to);
  } catch {
    // Another volume, or a filesystem without hard links.
    fs.copyFileSync(from, to);
  }
};

/** Stages the checkout's data; returns the plugins staged. */
export const stageHeadlessData = ({force = false} = {}) => {
  const files = sourceFiles();
  if (!force && !headlessDataIsStale({files})) return downloadedPlugins(files);
  const started = Date.now();
  if (files.length === 0) {
    // Nothing downloaded (any more): the stage would only hide that.
    fs.rmSync(HEADLESS_DATA, {recursive: true, force: true});
    fs.rmSync(STAMP, {force: true});
    log(`no language data in ${path.relative(root, SOURCE)}; run npm run script:initrepo to download it`);
    return [];
  }
  const staging = `${HEADLESS_DATA}.staging-${process.pid}`;
  fs.rmSync(staging, {recursive: true, force: true});
  const staged = new Set(files.map(([relative]) => relative));
  for (const [relative] of files) {
    // A table the builder will write from a staged JSON must not be a link: writeTable writes the file
    // in place, which would change the checkout's own copy through the link.
    if (relative.endsWith('.pack') && staged.has(relative.replace(/\.pack$/, '.json'))) continue;
    link(path.join(SOURCE, ...relative.split('/')), path.join(staging, ...relative.split('/')));
  }
  for (const json of DICTIONARY_JSON) {
    if (staged.has(json)) fs.rmSync(path.join(staging, ...tableFor(json).split('/')), {force: true});
  }
  const dictionaries = DICTIONARY_JSON.filter((json) => staged.has(json));
  if (dictionaries.length > 0) {
    log(`building ${dictionaries.length} dictionary tables (${dictionaries.map((json) => path.basename(json)).join(', ')})…`);
    // The builder holds a whole dictionary in memory, as the release build runs it (compressLanguageAssets.js).
    const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '--import', 'tsx', path.join(root, 'scripts', 'data', 'buildDictionaryTables.ts'), staging], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 1 << 20
    });
    if (result.error || result.status !== 0) {
      fs.rmSync(staging, {recursive: true, force: true});
      throw new Error(`the dictionary tables did not build${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
    }
  }
  // Swapped in whole, so a server never reads half a stage. A server running from the old one keeps its
  // open files (the old folder is removed after the swap).
  const old = `${HEADLESS_DATA}.old-${process.pid}`;
  try {
    if (fs.existsSync(HEADLESS_DATA)) fs.renameSync(HEADLESS_DATA, old);
    fs.renameSync(staging, HEADLESS_DATA);
  } catch (error) {
    fs.rmSync(staging, {recursive: true, force: true});
    throw new Error(`could not replace ${path.relative(root, HEADLESS_DATA)} (${error.code ?? error.message}); stop any running headless server and build again`);
  }
  fs.writeFileSync(STAMP, JSON.stringify(stampFor(files, sourceFiles(SOURCE, {quick: true}))));
  removeLeftovers();
  const plugins = downloadedPlugins(files);
  log(`staged ${plugins.join(', ')} in ${path.relative(root, HEADLESS_DATA)} (${files.length} files, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return plugins;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const force = process.argv.includes('-f');
    if (!force && !headlessDataIsStale()) log('up to date');
    else stageHeadlessData({force});
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
