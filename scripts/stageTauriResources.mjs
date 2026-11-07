// Release builds (`npm run tauri:build`, through src-tauri/tauri.release.conf.json): stages what ships
// beside the executable in src-tauri/resources/:
//   language-packs.json  what the app reads to offer each language's data as a download. The packs
//                     themselves (Miteiru-language-<id>.mtrpack) are release assets, built by
//                     scripts/data/buildLanguagePacks.ts: here into dist/language-packs/, or, with
//                     MITEIRU_LANGUAGE_PACKS_DIR=<folder holding language-packs.json> (CI builds them
//                     once, in their own job), taken from that folder and not staged at all
//   language-assets/  the same data as data tables (docs/DATA_FORMAT.md: one file per dictionary, one
//                     pack per stroke set instead of 21,000 files) and the other large files
//                     compressed (main/helpers/assetFiles.ts reads either form). Not bundled by
//                     tauri.release.conf.json; `npm run tauri:build:full` adds it back for an offline build
//   libmpv/           this platform's libmpv and its licence (Linux uses the system libmpv)
//   live-captions/    the live captions helper, when npm run build:live-captions built one
import {copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {compressLanguageAssets} = require('./compressLanguageAssets.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'src-tauri', 'resources');
const libmpvSource = path.join(root, 'resources', 'libmpv');

rmSync(stage, {recursive: true, force: true});
mkdirSync(stage, {recursive: true});

// ---- language packs, and the data they carry ----
const assetsSource = path.join(root, 'renderer', 'public', 'language-assets');
const packsDirectory = process.env.MITEIRU_LANGUAGE_PACKS_DIR ? path.resolve(process.env.MITEIRU_LANGUAGE_PACKS_DIR) : '';
const manifestStage = path.join(stage, 'language-packs.json');
if (packsDirectory) {
  const manifest = path.join(packsDirectory, 'language-packs.json');
  if (!existsSync(manifest)) {
    console.error(`[stageTauriResources] MITEIRU_LANGUAGE_PACKS_DIR=${packsDirectory} has no language-packs.json.`);
    process.exit(1);
  }
  copyFileSync(manifest, manifestStage);
  console.log(`[stageTauriResources] language packs from ${packsDirectory}; no language assets staged`);
} else if (existsSync(assetsSource) && readdirSync(assetsSource).some((name) => name !== '.DS_Store')) {
  // The downloaded asset archives carry macOS Finder files (.DS_Store), which have no place in an installer.
  cpSync(assetsSource, path.join(stage, 'language-assets'), {recursive: true, filter: (source) => path.basename(source) !== '.DS_Store'});
  compressLanguageAssets(stage);
  const packsOutput = path.join(root, 'dist', 'language-packs');
  rmSync(packsOutput, {recursive: true, force: true});
  // Through tsx, from the repo root so the imports resolve; builds from the staged, compressed copy.
  execFileSync(
    process.execPath,
    ['--import', 'tsx', path.join(root, 'scripts', 'data', 'buildLanguagePacks.ts'), path.join(stage, 'language-assets'), packsOutput],
    {cwd: root, stdio: 'inherit'}
  );
  copyFileSync(path.join(packsOutput, 'language-packs.json'), manifestStage);
} else {
  // No language data: the app still builds and runs, and offers no language downloads.
  const {version} = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  writeFileSync(manifestStage, `${JSON.stringify({format: 1, appVersion: version, baseUrl: '', packs: []}, null, 2)}\n`);
  console.warn(`[stageTauriResources] No language assets in ${assetsSource}; the build offers no language packs.`);
}

// ---- libmpv ----
const libmpvStage = path.join(stage, 'libmpv');
mkdirSync(libmpvStage, {recursive: true});
if (process.platform === 'win32' || process.platform === 'darwin') {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'fetchLibmpv.mjs'), '--if-needed'], {stdio: 'inherit'});
  const files = readdirSync(libmpvSource).filter((name) => name !== '.source');
  const main = process.platform === 'win32' ? 'libmpv-2.dll' : 'libmpv.2.dylib';
  if (!files.includes(main) || !files.includes('LICENSE.LGPL')) {
    console.error(`[stageTauriResources] ${libmpvSource} lacks ${main} or LICENSE.LGPL; the release would play no video.`);
    process.exit(1);
  }
  // macOS: the dylibs FFmpeg and friends ship as, linked to each other through @loader_path.
  for (const name of files) copyFileSync(path.join(libmpvSource, name), path.join(libmpvStage, name));
} else {
  writeFileSync(path.join(libmpvStage, 'README.txt'),
    'Miteiru plays video with the system libmpv on Linux (package libmpv2, or libmpv1 on older releases).\n');
}

// ---- live captions helper (built by npm run build:live-captions on Windows and macOS) ----
const captionsSource = path.join(root, 'resources', 'live-captions');
const captionsStage = path.join(stage, 'live-captions');
mkdirSync(captionsStage, {recursive: true});
const helpers = existsSync(captionsSource) ? readdirSync(captionsSource).filter((name) => name !== '.gitkeep') : [];
for (const name of helpers) cpSync(path.join(captionsSource, name), path.join(captionsStage, name), {recursive: true});
if (helpers.length === 0) {
  writeFileSync(path.join(captionsStage, 'README.txt'), 'Live captions are not available in this build.\n');
}
console.log(`[stageTauriResources] staged resources for ${process.platform} in ${path.relative(root, stage)}`);
