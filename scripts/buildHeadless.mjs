// Bundles Miteiru's headless language server (main/headless/main.ts) for Node into
// dist/headless/miteiru-headless.cjs. The app's code runs as it does in the backend worker, with the
// same shims for kuromoji, @node-rs/jieba and level, whose `sys(...)` the addon answers
// (main/headless/nodeSys.ts); everything else is Node's own.
//
//   node scripts/buildHeadless.mjs     build when a source changed since the last build
//   node scripts/buildHeadless.mjs -f  build anyway
import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = (name) => path.join(root, 'renderer/platform/backend/shims', `${name}.ts`);
export const HEADLESS_BUNDLE = path.join(root, 'dist', 'headless', 'miteiru-headless.cjs');
const STAMP = `${HEADLESS_BUNDLE}.inputs.json`;

/** Whether the bundle is older than one of the files it was built from (or than this script). */
export const headlessBundleIsStale = () => {
  try {
    const built = fs.statSync(HEADLESS_BUNDLE).mtimeMs;
    const inputs = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
    return [fileURLToPath(import.meta.url), ...inputs.map((input) => path.join(root, input))]
      .some((file) => !fs.existsSync(file) || fs.statSync(file).mtimeMs > built);
  } catch {
    return true;
  }
};

export const buildHeadless = async () => {
  const result = await build({
    entryPoints: [path.join(root, 'main/headless/main.ts')],
    outfile: HEADLESS_BUNDLE,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    alias: {
      kuromoji: shim('kuromoji'),
      '@node-rs/jieba': shim('jieba'),
      level: shim('level')
    },
    metafile: true,
    legalComments: 'none',
    logLevel: 'warning',
    // Build messages go to stderr: stdout belongs to MCP.
    logOverride: {}
  });
  fs.writeFileSync(STAMP, JSON.stringify(Object.keys(result.metafile.inputs).filter((input) => !input.startsWith('node_modules/'))));
  return HEADLESS_BUNDLE;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('-f') || headlessBundleIsStale()) {
    await buildHeadless();
    console.error(`[buildHeadless] built ${path.relative(root, HEADLESS_BUNDLE)}`);
  } else {
    console.error('[buildHeadless] up to date');
  }
}
