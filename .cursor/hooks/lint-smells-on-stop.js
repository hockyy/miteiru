const {spawnSync} = require("child_process");
const fs = require("fs");

let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {
  input = "";
}

const result = spawnSync(process.execPath, ["scripts/lint-smells.js"], {
  encoding: "utf8",
  cwd: process.cwd()
});

if (result.status === 0) {
  process.stdout.write("{}\n");
  process.exit(0);
}

const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
const followup = [
  "lint-smells found issues. Fix them before finishing.",
  output
].filter(Boolean).join("\n");

process.stdout.write(JSON.stringify({
  followup_message: followup,
  agent_message: followup
}) + "\n");
process.exit(0);
