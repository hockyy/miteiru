const { spawnSync } = require("child_process");

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const cutoffDate = new Date(Date.now() - ONE_WEEK_MS).toISOString();

console.log(`Running npm update with cutoff: ${cutoffDate}`);
console.log("Only versions published at least 7 days ago will be considered.");

const result = spawnSync("npm", ["update", `--before=${cutoffDate}`], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
