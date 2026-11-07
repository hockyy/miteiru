// Fetches the libmpv build the desktop app bundles into resources/libmpv/ (gitignored).
// Each archive is pinned and checked against its SHA-256 before use.
//   node scripts/fetchLibmpv.mjs [--if-needed]
// LIBMPV_ARCHIVE=<path> uses an already-downloaded copy of the pinned archive instead of downloading.
// MITEIRU_LIBMPV_TARGET=darwin-universal picks the universal macOS build (default: this machine's).
// Linux has no entry: the app uses the distribution's libmpv there.
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import extractZip from "extract-zip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "resources", "libmpv");
const lgplText = path.join(root, "resources", "licenses", "libmpv-LGPL-2.1.txt");

// LGPL builds only: a GPL libmpv can't be combined with Miteiru's CC BY-NC-SA licence.
// macOS: media-kit's "video-full" flavour (mpv -Dgpl=false, FFmpeg without GPL/nonfree parts).
const MEDIA_KIT = "https://github.com/media-kit/libmpv-darwin-build/releases/download/v0.7.3";
const BUILDS = {
  "win32-x64": {
    url: "https://github.com/mpv-player/mpv/releases/download/v0.42.0/libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip",
    sha256: "8e5f77430efc53ef175804ba6618527e3af0448a0dcabf04d3cc72659d1a6fce",
    main: "libmpv-2.dll",
  },
  "darwin-arm64": {
    url: `${MEDIA_KIT}/libmpv-libs_v0.7.3_macos-arm64-video-full.tar.gz`,
    sha256: "9bb168ec908b4801f4231f411e3278a0aea644a2b03ce375c880d2813ab7f949",
    main: "libmpv.2.dylib",
  },
  "darwin-x64": {
    url: `${MEDIA_KIT}/libmpv-libs_v0.7.3_macos-amd64-video-full.tar.gz`,
    sha256: "a80df4079e8a15db2237993bd4787fdd87ecb1e3c36de5dd832f4e4385f77704",
    main: "libmpv.2.dylib",
  },
  "darwin-universal": {
    url: `${MEDIA_KIT}/libmpv-libs_v0.7.3_macos-universal-video-full.tar.gz`,
    sha256: "f570695d8ba8534835dd4cba0b6e275579c1c22c01a9da0442748ca37e2daac1",
    main: "libmpv.2.dylib",
  },
};

const target = process.env.MITEIRU_LIBMPV_TARGET || `${process.platform}-${process.arch}`;
const build = BUILDS[target];
if (!build) {
  console.log(`[libmpv] no pinned build for ${target}; skipping (Linux uses the system libmpv).`);
  process.exit(0);
}

const stampPath = path.join(outDir, ".source");
const present = () => fs.existsSync(path.join(outDir, build.main)) && fs.existsSync(path.join(outDir, "LICENSE.LGPL"))
  && fs.existsSync(stampPath) && fs.readFileSync(stampPath, "utf8").trim() === build.sha256;
if (process.argv.includes("--if-needed") && present()) {
  console.log("[libmpv] already present");
  process.exit(0);
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

let archive = process.env.LIBMPV_ARCHIVE || process.env.LIBMPV_ZIP;
let tempDir;
if (!archive) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-libmpv-"));
  archive = path.join(tempDir, path.basename(new URL(build.url).pathname));
  console.log(`[libmpv] downloading ${build.url}`);
  const response = await fetch(build.url);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
}

const actual = sha256(archive);
if (actual !== build.sha256) {
  throw new Error(`[libmpv] SHA-256 mismatch for ${archive}: expected ${build.sha256}, got ${actual}`);
}

const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-libmpv-x-"));
if (archive.endsWith(".zip")) {
  await extractZip(archive, {dir: extractDir});
} else {
  execFileSync("tar", ["-xzf", archive, "-C", extractDir]);
}

fs.rmSync(outDir, {recursive: true, force: true});
fs.mkdirSync(outDir, {recursive: true});

const walk = (dir) => fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

if (process.platform === "win32" || build.url.endsWith(".zip")) {
  fs.copyFileSync(path.join(extractDir, build.main), path.join(outDir, build.main));
  fs.copyFileSync(path.join(extractDir, "LICENSE.LGPL"), path.join(outDir, "LICENSE.LGPL"));
} else {
  copyDarwinLibraries(walk(extractDir));
  fs.copyFileSync(lgplText, path.join(outDir, "LICENSE.LGPL"));
}
fs.writeFileSync(stampPath, `${build.sha256}\n`);
fs.rmSync(extractDir, {recursive: true, force: true});
if (tempDir) fs.rmSync(tempDir, {recursive: true, force: true});
console.log(`[libmpv] ${fs.readdirSync(outDir).filter((f) => f !== ".source").join(", ")} → ${path.relative(root, outDir)}`);

/**
 * macOS: flattens every dylib of the archive into resources/libmpv/ under the names they link each
 * other by, and points those links at @loader_path so the folder works wherever the app is. The main
 * library is also stored as libmpv.2.dylib, the name src-tauri/src/player.rs loads.
 */
function copyDarwinLibraries(files) {
  const dylibs = files.filter((file) => /\.dylib$/.test(file));
  const real = new Map();
  for (const file of dylibs) {
    const name = path.basename(file);
    const resolved = fs.realpathSync(file);
    if (!real.has(name)) real.set(name, resolved);
  }
  for (const [name, source] of real) fs.copyFileSync(source, path.join(outDir, name));

  const mainName = [...real.keys()].find((name) => /^libmpv(\.\d+)?\.dylib$/.test(name));
  if (!mainName) throw new Error(`[libmpv] no libmpv dylib in the archive (found ${[...real.keys()].join(", ")})`);
  // Nothing links to libmpv itself, so it can take the name the app loads.
  if (mainName !== build.main) fs.renameSync(path.join(outDir, mainName), path.join(outDir, build.main));

  if (process.platform !== "darwin") {
    console.warn("[libmpv] not on macOS: library links were left unchanged");
    return;
  }
  const bundled = new Set(fs.readdirSync(outDir));
  for (const name of bundled) {
    if (!name.endsWith(".dylib")) continue;
    const file = path.join(outDir, name);
    const links = execFileSync("otool", ["-L", file], {encoding: "utf8"}).split("\n").slice(1)
      .map((line) => line.trim().split(" (")[0]).filter(Boolean);
    for (const link of links) {
      const linked = path.basename(link);
      if (bundled.has(linked) && link !== `@loader_path/${linked}`) {
        execFileSync("install_name_tool", ["-change", link, `@loader_path/${linked}`, file]);
      }
    }
    execFileSync("install_name_tool", ["-id", `@loader_path/${name}`, file]);
    // Editing the load commands invalidates the signature; Apple silicon refuses unsigned code.
    execFileSync("codesign", ["--force", "--sign", "-", file]);
  }
  console.log(execFileSync("otool", ["-L", path.join(outDir, build.main)], {encoding: "utf8"}));
}
