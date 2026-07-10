const fs = require('fs-extra');
const path = require('path');

const nextDir = path.join(__dirname, '../renderer/.next');

async function main() {
  if (await fs.pathExists(nextDir)) {
    await fs.remove(nextDir);
    console.log('[cleanRendererNext] Removed renderer/.next');
  }
}

main().catch((error) => {
  console.error('[cleanRendererNext] Failed:', error);
  process.exit(1);
});
