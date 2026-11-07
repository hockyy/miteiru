/*
 * Prints a data table's header, and with a key its value (decoded by the table's codec).
 *
 *   npx tsx scripts/data/inspectTable.ts <file.pack> [key]
 */
import path from "node:path";
import {get, openTable} from "../../main/helpers/dataTable";
import {codecFor} from "../../main/helpers/dataCodecs";

const main = async () => {
  const [file, key] = process.argv.slice(2);
  if (!file) {
    console.error("usage: inspectTable.ts <file.pack> [key]");
    process.exit(2);
  }
  const target = path.resolve(file);
  const {header} = await openTable(target);
  const compressed = header.blocks.reduce((total, block) => total + block[2], 0);
  console.log(`dataset      ${header.dataset} (version ${header.version})`);
  console.log(`format       MTRPACK${header.format}, ${header.compression}, codec ${header.codec}`);
  console.log(`source       ${header.source.name}, ${header.source.url}, ${header.source.license}`);
  console.log(`entries      ${header.entries} in ${header.blocks.length} blocks, ${compressed} bytes compressed`);
  console.log(`first key    ${header.blocks[0]?.[0] ?? "(empty)"}`);
  if (key !== undefined) {
    const value = await get(target, key);
    if (!value) {
      console.error(`no entry for ${JSON.stringify(key)}`);
      process.exit(1);
    }
    console.log(`\n${codecFor(header.codec).decode(value)}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
