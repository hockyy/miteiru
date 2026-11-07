// Builds the release's latest.json for tauri-plugin-updater from the signed update artifacts the
// release workflow uploaded, and uploads it (.github/workflows/release.yml, job updater-manifest):
//   node scripts/makeUpdaterManifest.mjs <tag> [--dry-run]
// The app reads https://github.com/<repo>/releases/latest/download/latest.json
// (plugins.updater.endpoints in src-tauri/tauri.conf.json).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Which updater platform each signed artifact serves, by file name. */
export const PLATFORM_ARTIFACTS = [
  {platform: 'windows-x86_64', pattern: /_x64-setup\.exe$/},
  {platform: 'darwin-aarch64', pattern: /_aarch64\.app\.tar\.gz$/},
  {platform: 'darwin-x86_64', pattern: /_x64\.app\.tar\.gz$/},
  {platform: 'linux-x86_64', pattern: /_amd64\.AppImage$/}
];

/**
 * latest.json for `version`. `signatures` maps an artifact's file name to the contents of its
 * .sig file. Platforms this release has no artifact for keep their entry from `previous` when that
 * is the same version (a rebuild of one platform), and are dropped otherwise.
 */
export const buildManifest = ({version, notes, pubDate, repo, tag, signatures}, previous = null) => {
  const platforms = previous?.version === version ? {...previous.platforms} : {};
  for (const [file, signature] of Object.entries(signatures)) {
    const match = PLATFORM_ARTIFACTS.find(({pattern}) => pattern.test(file));
    if (!match) continue;
    platforms[match.platform] = {
      signature: signature.trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`
    };
  }
  return {version, notes, pub_date: pubDate, platforms};
};

const gh = (...args) => execFileSync('gh', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']});

const main = () => {
  const [tag, ...flags] = process.argv.slice(2);
  if (!tag) throw new Error('usage: node scripts/makeUpdaterManifest.mjs <tag> [--dry-run]');
  const repo = process.env.GITHUB_REPOSITORY || 'hockyy/miteiru';
  const version = tag.replace(/^v/, '');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'miteiru-updater-'));

  gh('release', 'download', tag, '--repo', repo, '--dir', work, '--pattern', '*.sig', '--clobber');
  const signatures = {};
  for (const name of fs.readdirSync(work).filter((n) => n.endsWith('.sig'))) {
    signatures[name.slice(0, -'.sig'.length)] = fs.readFileSync(path.join(work, name), 'utf8');
  }
  if (Object.keys(signatures).length === 0) {
    console.log(`No signed update artifacts on ${tag}; latest.json is left as it is.`);
    return;
  }

  let previous = null;
  try {
    gh('release', 'download', tag, '--repo', repo, '--dir', work, '--pattern', 'latest.json', '--clobber');
    previous = JSON.parse(fs.readFileSync(path.join(work, 'latest.json'), 'utf8'));
  } catch {
    // The first manifest for this release.
  }

  const notesFile = path.join('docs', 'whats-new', `${version}.md`);
  const notes = fs.existsSync(notesFile)
    ? fs.readFileSync(notesFile, 'utf8').trim()
    : `See https://github.com/${repo}/releases/tag/${tag}`;
  const manifest = buildManifest({version, notes, pubDate: new Date().toISOString(), repo, tag, signatures}, previous);
  const out = path.join(work, 'latest.json');
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`latest.json for ${tag}: ${Object.keys(manifest.platforms).join(', ')}`);
  if (flags.includes('--dry-run')) {
    console.log(fs.readFileSync(out, 'utf8'));
    return;
  }
  gh('release', 'upload', tag, out, '--repo', repo, '--clobber');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
