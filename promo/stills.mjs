// Usage: node stills.mjs <frame> [frame...] — bundle once, render each frame to out/stills/f<frame>.jpg,
// for checking frames without rendering the whole video (python sheet.py <frames> tiles them).
import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {renderStill, selectComposition} from "@remotion/renderer";

const frames = process.argv.slice(2).map(Number);
const root = path.dirname(fileURLToPath(import.meta.url));
const serveUrl = await bundle({entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public")});
const composition = await selectComposition({serveUrl, id: "Promo"});
fs.mkdirSync(path.join(root, "out/stills"), {recursive: true});
for (const frame of frames) {
  await renderStill({composition, serveUrl, frame, output: path.join(root, `out/stills/f${frame}.jpg`), imageFormat: "jpeg", jpegQuality: 85});
  console.log("rendered", frame);
}
