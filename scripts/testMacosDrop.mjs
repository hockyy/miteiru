// Exercises the native pasteboard bridge without a WebView or a video playing.
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if (process.platform !== 'darwin') {
  console.log('macOS drop tests require AppKit; skipped on this platform.');
  process.exit(0);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(path.join(os.tmpdir(), 'miteiru-drop-test-'));
try {
  const binary = path.join(temporary, 'drop-test');
  for (const [command, args] of [
    ['clang', ['-fobjc-arc', '-framework', 'Cocoa', 'src-tauri/native/macos_drop.m', 'tests/native/macosDrop.test.m', '-o', binary]],
    [binary, []],
  ]) {
    const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
  }
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
