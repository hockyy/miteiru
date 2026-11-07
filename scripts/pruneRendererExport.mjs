// After `next build renderer` (the static export in app/): drops the language assets the page never
// fetches. Tauri embeds the export in the executable, while the backend reads the dictionaries from the
// bundled resources (scripts/stageTauriResources.mjs), so only files the renderer loads by URL stay.
import {existsSync, readdirSync, rmSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.join(root, 'app');
const assetsDir = path.join(exportDir, 'language-assets');

// Fetched by URL in renderer/utils/pitchAccent.ts and renderer/utils/jpGrammarCatalog.ts.
const KEEP = ['japanese/pitch', 'japanese/grammar'];

const isKept = (relative) => KEEP.some((kept) => kept === relative || kept.startsWith(`${relative}/`) || relative.startsWith(`${kept}/`));

const prune = (directory, relative = '') => {
  for (const name of readdirSync(directory)) {
    const childRelative = relative ? `${relative}/${name}` : name;
    const child = path.join(directory, name);
    if (!isKept(childRelative)) {
      rmSync(child, {recursive: true, force: true});
    } else if (!KEEP.includes(childRelative) && statSync(child).isDirectory()) {
      prune(child, childRelative);
    }
  }
};

if (!existsSync(exportDir)) {
  console.error('[pruneRendererExport] app/ does not exist; run next build renderer first.');
  process.exit(1);
}
if (existsSync(assetsDir)) prune(assetsDir);
rmSync(path.join(exportDir, 'backend-worker.js.map'), {force: true});
console.log('[pruneRendererExport] kept only the renderer-fetched language assets in app/');
