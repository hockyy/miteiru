import type {MiteiruAddon} from "./nativeAddon";

/** The same batch responses as the Tauri commands, also used by the standalone Node tools. */
export const readingCommands = (addon: MiteiruAddon) => ({
  jyutping_batch: (args: Record<string, unknown>) => JSON.parse(addon.jyutpingBatch(args.texts as string[])),
});
