// Bundles the Tauri backend worker (renderer/platform/backend/worker.ts, which runs main/'s Electron
// handlers) into renderer/public/backend-worker.js, and copies kuromoji's dictionary beside it.
//
//   node scripts/buildBackendWorker.mjs            one build
//   node scripts/buildBackendWorker.mjs --watch    rebuild on change
import {build, context} from 'esbuild';
import {cpSync, existsSync, mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = (name) => path.join(root, 'renderer/platform/backend/shims', `${name}.ts`);
const watch = process.argv.includes('--watch');
const production = !watch && process.env.NODE_ENV !== 'development';

// Node and Electron modules main/ imports -> what the worker uses instead.
const alias = {
  electron: shim('electron'),
  fs: shim('fs'),
  'node:fs': shim('fs'),
  'fs/promises': shim('fsPromises'),
  'node:fs/promises': shim('fsPromises'),
  path: 'pathe',
  'node:path': 'pathe',
  os: shim('os'),
  'node:os': shim('os'),
  child_process: shim('childProcess'),
  'node:child_process': shim('childProcess'),
  level: shim('level'),
  '@node-rs/jieba': shim('jieba'),
  'electron-store': shim('electronStore'),
  kuromoji: shim('kuromoji'),
  zlib: shim('zlib'),
  'node:zlib': shim('zlib'),
  crypto: shim('crypto'),
  'node:crypto': shim('crypto'),
  util: shim('util'),
  'node:util': shim('util'),
  stream: shim('unsupported'),
  'node:stream': shim('unsupported'),
  url: shim('unsupported'),
  'node:url': shim('unsupported'),
  http: shim('unsupported'),
  'node:http': shim('unsupported'),
  // Packages from node_modules (the platform has no Node builtins to fall back on).
  buffer: path.join(root, 'node_modules/buffer/index.js'),
  events: path.join(root, 'node_modules/events/events.js')
};

const options = {
  entryPoints: [path.join(root, 'renderer/platform/backend/worker.ts')],
  outfile: path.join(root, 'renderer/public/backend-worker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  alias,
  inject: [shim('inject')],
  define: {'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')},
  sourcemap: production ? false : 'linked',
  minify: production,
  legalComments: 'none',
  logLevel: 'info'
};

const copyKuromojiDictionary = () => {
  const source = path.join(root, 'node_modules/kuromoji/dict');
  const target = path.join(root, 'renderer/public/kuromoji-dict');
  if (existsSync(target) && readdirSync(target).length === readdirSync(source).length) return;
  mkdirSync(target, {recursive: true});
  cpSync(source, target, {recursive: true});
  console.log(`Copied kuromoji dictionary to ${path.relative(root, target)}`);
};

copyKuromojiDictionary();

const failOnWarnings = (result) => {
  if (result.warnings.length > 0) {
    console.error(`Backend worker build has ${result.warnings.length} warning(s).`);
    if (!watch) process.exit(1);
  }
};

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [{
      name: 'report',
      setup(buildApi) {
        buildApi.onEnd((result) => {
          console.log(result.errors.length ? 'Backend worker: build failed' : 'Backend worker: rebuilt');
        });
      }
    }]
  });
  await ctx.watch();
  console.log('Watching renderer/platform/backend and main/ for changes...');
} else {
  failOnWarnings(await build(options));
}
