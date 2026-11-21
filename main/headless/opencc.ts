import path from 'node:path';
import type {OpenccMode} from '../language/opencc';
import {defaultAddonPath, loadAddon, type MiteiruAddon} from './nativeAddon';

// Standalone Node scripts use the same native batch as the headless server's system bridge.
let addon: MiteiruAddon | undefined;
export function convertOpencc(mode: OpenccMode, lines: string[]): string[] {
  addon ??= loadAddon(defaultAddonPath(path.resolve(__dirname, '../..')));
  return addon.openccConvertBatch(mode, lines);
}
