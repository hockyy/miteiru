const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["main", "renderer", "scripts"];
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "dist",
  "app",
  "language-assets",
  "archived",
  "bin",
  "obj"
]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

const RULES = [
  {
    id: "no-clipboard-readText",
    message: "navigator.clipboard.readText() is blocked in Electron. Use event.clipboardData.getData('text') on paste.",
    test: (filePath, content) => /navigator\.clipboard\.readText\s*\(/.test(content)
  },
  {
    id: "no-youtube-self-referer",
    message: "Do not set Referer/Origin to youtube.com (YouTube error 152). Use https://miteiru.hocky.id.",
    test: (filePath, content) => {
      if (filePath.includes(`${path.sep}tests${path.sep}`) || filePath.includes("lint-smells")) return false;
      return /Referer['"`\s:=]+https?:\/\/(www\.)?youtube\.com/i.test(content)
        || /Origin['"`\s:=]+['"`]https?:\/\/(www\.)?youtube\.com/i.test(content);
    }
  },
  {
    id: "no-stacked-normalized-temp",
    message: "Do not build miteiru_normalized_ names from the source basename + Date.now(). Use subtitleCaches.normalizedSubtitleOutputPath and skip already-normalized files.",
    test: (filePath, content) => {
      if (filePath.includes(`${path.sep}subtitleCaches.`)) return false;
      if (filePath.includes(`${path.sep}lint-smells`)) return false;
      return /miteiru_normalized_\$\{/.test(content);
    }
  },
  {
    id: "reload-original-subtitle-path",
    message: "Reload/store subtitle paths from the original source file, not the processed temp subtitlePath.",
    test: (filePath, content) => {
      if (!/useLoadFiles\.(tsx?|jsx?)$/.test(filePath)) return false;
      return /loadSubtitleAs(?:Primary|Secondary)\(\s*\w+\s*,\s*subtitlePath\s*\)/.test(content);
    }
  }
];

const collectFindings = (filePath, content) => {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("lint-smells")) return [];
  return RULES
    .filter((rule) => rule.test(filePath, content))
    .map((rule) => ({filePath, id: rule.id, message: rule.message}));
};

const shouldSkipDir = (name) => SKIP_DIR_NAMES.has(name) || name.startsWith(".");

const walk = (dir, files = []) => {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walk(fullPath, files);
      continue;
    }
    if (SOURCE_EXT.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
};

const run = () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const findings = files.flatMap((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    return collectFindings(filePath, content);
  });

  if (findings.length === 0) {
    console.log("lint-smells: no issues");
    return 0;
  }

  for (const finding of findings) {
    const relative = path.relative(ROOT, finding.filePath);
    console.error(`${relative}: ${finding.id}: ${finding.message}`);
  }
  console.error(`lint-smells: ${findings.length} issue(s)`);
  return 1;
};

if (require.main === module) {
  process.exitCode = run();
}

module.exports = {
  RULES,
  collectFindings,
  run
};
