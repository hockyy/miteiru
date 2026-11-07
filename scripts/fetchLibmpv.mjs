// Fetches the libmpv build the desktop app bundles into resources/libmpv/ (gitignored).
// Pinned to an official mpv release asset and checked against its SHA-256 before use.
//   node scripts/fetchLibmpv.mjs [--if-needed]
// LIBMPV_ZIP=<path> uses an already-downloaded copy of the pinned zip instead of downloading it.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import extractZip from "extract-zip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "resources", "libmpv");

// LGPL builds only: a GPL libmpv can't be combined with Miteiru's CC BY-NC-SA licence.
const BUILDS = {
  "win32-x64": {
    url: "https://github.com/mpv-player/mpv/releases/download/v0.42.0/libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip",
    sha256: "8e5f77430efc53ef175804ba6618527e3af0448a0dcabf04d3cc72659d1a6fce",
    files: ["libmpv-2.dll", "LICENSE.LGPL"],
  },
};

const target = `${process.platform}-${process.arch}`;
const build = BUILDS[target];
if (!build) {
  console.log(`[libmpv] no pinned build for ${target}; skipping (macOS and Linux use their own sources).`);
  process.exit(0);
}

if (process.argv.includes("--if-needed") && build.files.every((f) => fs.existsSync(path.join(outDir, f)))) {
  console.log("[libmpv] already present");
  process.exit(0);
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

let zipPath = process.env.LIBMPV_ZIP;
let tempDir;
if (!zipPath) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-libmpv-"));
  zipPath = path.join(tempDir, path.basename(new URL(build.url).pathname));
  console.log(`[libmpv] downloading ${build.url}`);
  const response = await fetch(build.url);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
}

const actual = sha256(zipPath);
if (actual !== build.sha256) {
  throw new Error(`[libmpv] SHA-256 mismatch for ${zipPath}: expected ${build.sha256}, got ${actual}`);
}

const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-libmpv-x-"));
await extractZip(zipPath, {dir: extractDir});
fs.mkdirSync(outDir, {recursive: true});
for (const file of build.files) {
  fs.copyFileSync(path.join(extractDir, file), path.join(outDir, file));
}
fs.rmSync(extractDir, {recursive: true, force: true});
if (tempDir) fs.rmSync(tempDir, {recursive: true, force: true});
console.log(`[libmpv] ${build.files.join(", ")} → ${path.relative(root, outDir)}`);
