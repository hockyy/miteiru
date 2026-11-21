import type {MiteiruAddon} from "./nativeAddon";

/** The same batch responses as the Tauri commands, also used by the standalone Node tools. */
export const readingCommands = (addon: MiteiruAddon) => ({
  jyutping_batch: (args: Record<string, unknown>) => addon.jyutpingBatch(args.texts as string[]),
  pinyin_batch: (args: Record<string, unknown>) => JSON.parse(addon.pinyinBatch(args.texts as string[], args.simplify === true)),
  pinyin_readings_batch: (args: Record<string, unknown>) => addon.pinyinReadingsBatch(args.texts as string[], args.symbols === true, args.simplify === true),
  convert_pinyin_batch: (args: Record<string, unknown>) => addon.convertPinyinBatch(args.texts as string[], args.toSymbols === true),
});
