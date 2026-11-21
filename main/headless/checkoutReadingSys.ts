import path from "node:path";
import {defaultAddonPath, loadAddon} from "./nativeAddon";
import {readingCommands} from "./readingCommands";

// Unbundled Node tools and tests use the checkout addon. The worker and server install their own sys bridge.
let commands: ReturnType<typeof readingCommands> | undefined;
export async function sys(command: keyof ReturnType<typeof readingCommands>, args: Record<string, unknown>) {
  commands ??= readingCommands(loadAddon(defaultAddonPath(path.resolve(__dirname, "../.."))));
  return commands[command](args);
}
