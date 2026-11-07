// `npm run dev:renderer` (Tauri's beforeDevCommand): the backend worker in watch mode plus the Next dev server.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = path.join(root, 'node_modules/next/dist/bin/next');

const children = [
  spawn(process.execPath, [path.join(root, 'scripts/buildBackendWorker.mjs'), '--watch'], {cwd: root, stdio: 'inherit'}),
  spawn(process.execPath, [nextBin, 'dev', 'renderer', '-p', '8888'], {cwd: root, stdio: 'inherit'})
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  process.exit(code);
};

// Either process ending takes the other down, so Tauri never keeps a half-working dev setup.
children.forEach((child) => child.on('exit', (code) => stop(code ?? 1)));
['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => stop(0)));
