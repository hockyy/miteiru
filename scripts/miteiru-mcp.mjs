#!/usr/bin/env node
// Miteiru's headless language server: the MCP tools over stdin and stdout, without the app open and
// without a window. It reads the installed Miteiru's language packs, settings and saved words (or a
// profile named with --profile) and tokenizes with the app's own Rust tokenizers. docs/LOCAL_API.md.
//
//   node scripts/miteiru-mcp.mjs [--profile <dir>] [--dev-profile] [--assets <dir>]
//                                [--preload learner|all|none] [--no-proxy] [--build] [--check]
//
//   --profile <dir>   a Miteiru user data folder (as MITEIRU_USER_DATA_DIR); its packs are <dir>/language-packs
//   --dev-profile     a development build's profile, "miteiru (development)"
//   --assets <dir>    a folder of <plugin>/... language data to read before the installed packs
//   --preload ...     languages to load at start: the learner's (default), all installed, or none
//   --no-proxy        never hand open_video or set_word_levels to a running Miteiru
//   --build           rebuild the bundle and the addon, then exit
//   --check           print the paths it would use, then exit
//
// The first start builds the Node addon with cargo (about 20 seconds) and bundles the server with
// esbuild (under a second); later starts reuse both until their sources change. Nothing but MCP
// messages is written to stdout: progress goes to stderr.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHeadless, headlessBundleIsStale} from './buildHeadless.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
};
const options = (name) => args.flatMap((arg, index) => (arg === name && index + 1 < args.length ? [args[index + 1]] : []));
const flag = (name) => args.includes(name);
const log = (message) => process.stderr.write(`[miteiru-mcp] ${message}\n`);

const addonFile = process.platform === 'win32' ? 'miteiru_node.dll' : process.platform === 'darwin' ? 'libmiteiru_node.dylib' : 'libmiteiru_node.so';
const addonPath = process.env.MITEIRU_NODE_ADDON || path.join(root, 'native', 'rust', 'target', 'release', addonFile);
const rustSources = ['miteiru-langdata', 'miteiru-tokenizer', 'miteiru-node'].map((crate) => path.join(root, 'native', 'rust', 'crates', crate));

const newestMtime = (directory) => {
  let newest = 0;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(target));
    else newest = Math.max(newest, fs.statSync(target).mtimeMs);
  }
  return newest;
};

const addonIsStale = () => {
  if (process.env.MITEIRU_NODE_ADDON) return false;
  if (!fs.existsSync(addonPath)) return true;
  const built = fs.statSync(addonPath).mtimeMs;
  return rustSources.some((directory) => fs.existsSync(directory) && newestMtime(directory) > built);
};

const buildAddon = () => {
  log('building the Node addon (cargo build --release -p miteiru-node)…');
  // cargo's output goes to stderr only: stdout is the MCP channel.
  const result = spawnSync('cargo', ['build', '--release', '--manifest-path', path.join(root, 'native', 'rust', 'Cargo.toml'), '-p', 'miteiru-node'], {
    cwd: root,
    stdio: ['ignore', process.stderr, process.stderr],
    shell: false
  });
  if (result.error || result.status !== 0) {
    log(`the addon did not build${result.error ? `: ${result.error.message}` : ''}. Is Rust (cargo) installed? https://rustup.rs`);
    return false;
  }
  return true;
};

if (flag('--check')) {
  process.stderr.write(`${JSON.stringify({root, addon: addonPath, addonStale: addonIsStale(), bundleStale: headlessBundleIsStale()}, null, 2)}\n`);
  process.exit(0);
}

if (flag('--build') || addonIsStale()) buildAddon();
let bundle;
if (flag('--build') || headlessBundleIsStale()) {
  const builtAt = performance.now();
  bundle = await buildHeadless();
  log(`bundled the server in ${Math.round(performance.now() - builtAt)} ms`);
} else {
  bundle = path.join(root, 'dist', 'headless', 'miteiru-headless.cjs');
}
if (flag('--build')) process.exit(0);

const preload = option('--preload');
const require = createRequire(import.meta.url);
const {startHeadless} = require(bundle);
try {
  await startHeadless({
    repoRoot: root,
    profile: option('--profile'),
    development: flag('--dev-profile'),
    addonPath,
    assets: options('--assets'),
    preload: preload === 'all' || preload === 'none' ? preload : 'learner',
    proxy: !flag('--no-proxy')
  });
  process.stdout.write('', () => process.exit(0));
} catch (error) {
  log(`stopped: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
}
