// Release builds (`npm run tauri:build`, through src-tauri/tauri.release.conf.json): stages what ships
// beside the executable in src-tauri/resources/:
//   language-assets/  the dictionaries and the stroke data as data tables (docs/DATA_FORMAT.md: one
//                     file per dictionary, one pack per stroke set instead of 21,000 files), and the
//                     other large files gzipped (main/helpers/assetFiles.ts reads either form)
//   libmpv/           this platform's libmpv and its licence (Linux uses the system libmpv)
//   live-captions/    the live captions helper, when npm run build:live-captions built one
import {copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
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

// ---- language assets ----
const assetsSource = path.join(root, 'renderer', 'public', 'language-assets');
// The downloaded asset archives carry macOS Finder files (.DS_Store), which have no place in an installer.
cpSync(assetsSource, path.join(stage, 'language-assets'), {recursive: true, filter: (source) => path.basename(source) !== '.DS_Store'});
compressLanguageAssets(stage);

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
