import {formatKeys, isMacPlatform} from "./platform";
import type {KeyCommand} from "./keyCommands";
import {mainSubtitleNameInSentence} from "./subtitleLabels";

export type ShortcutItem = { keys: string; description: string };
export type ShortcutGroup = { title: string; items: ShortcutItem[] };

type ShortcutOptions = {
  /** The language being learned ("Japanese"), named where the sheet speaks of the main subtitle. */
  languageName?: string;
  mac?: boolean;
};

const KEY_NAMES: Record<string, string> = {Escape: 'Esc'};

/** "Ctrl + Shift + L" for a command; ⌘ replaces Ctrl on macOS. */
export const commandKeys = (command: KeyCommand, mac: boolean = isMacPlatform()): string => {
  const parts = ['Ctrl', 'Shift', 'Alt'].filter((modifier) => command.modifiers.includes(modifier));
  parts.push(KEY_NAMES[command.currentKey] ?? (command.currentKey.length === 1 ? command.currentKey.toUpperCase() : command.currentKey));
  return formatKeys(parts, mac);
};

/** The order the groups show in; commands of an unlisted category follow. */
const GROUP_ORDER = ['Video', 'Word popup', 'Subtitles', 'Panels', 'Go to', 'Look up', 'Copy'];

/**
 * Keys that are not in the `useKeyBind` commands: playback, mouse actions, the popup's own keys.
 * Anything bound through `useKeyBind` appears by itself, so the list cannot drift from the keys.
 */
const extraShortcuts = (language: string, mac: boolean): ShortcutGroup[] => [
  {
    title: 'Video',
    items: [
      {keys: 'Space / E', description: 'Play or pause'},
      {keys: 'R', description: 'Repeat the current line'},
      {keys: '← / →', description: 'Back or forward 2 seconds'},
      {keys: 'Double-click', description: 'Left half of the video: back 5 seconds. Right half: forward 5 seconds'},
      {keys: '?', description: 'Show this list'},
      {keys: formatKeys(['Ctrl', 'Shift', 'P'], mac), description: 'Search all commands'}
    ]
  },
  {
    title: 'Word popup',
    items: [
      {keys: 'Right-click', description: 'On a word in the subtitle: change how well you know it (this saves the word)'},
      {keys: 'W', description: 'Copy the word'},
      {keys: 'Shift + W', description: 'Copy the word with its reading'}
    ]
  },
  {
    title: 'Subtitles',
    items: [
      // `]` adds to the shift and every line then shows later; `[` the opposite (utils/subtitleTiming.ts).
      {keys: '[', description: `Show the ${mainSubtitleNameInSentence(language)} 0.1 s earlier`},
      {keys: ']', description: `Show the ${mainSubtitleNameInSentence(language)} 0.1 s later`},
      {keys: formatKeys(['Ctrl', '['], mac), description: 'Show the translation 0.1 s earlier'},
      {keys: formatKeys(['Ctrl', ']'], mac), description: 'Show the translation 0.1 s later'}
    ]
  }
];

/**
 * The shortcut sheet: every `useKeyBind` command by its category, plus the extra keys. Commands that
 * do the same thing share a line ("Esc / H").
 */
export const buildShortcutGroups = (commands: KeyCommand[], options: ShortcutOptions = {}): ShortcutGroup[] => {
  const mac = options.mac ?? isMacPlatform();
  const language = options.languageName || 'main';
  const groups = new Map<string, ShortcutItem[]>();
  const add = (title: string, item: ShortcutItem) => {
    const items = groups.get(title) ?? [];
    const same = items.find((existing) => existing.description === item.description);
    if (same) same.keys = `${same.keys} / ${item.keys}`;
    else items.push(item);
    groups.set(title, items);
  };
  for (const group of extraShortcuts(language, mac)) group.items.forEach((item) => add(group.title, item));
  for (const command of commands) add(command.category, {keys: commandKeys(command, mac), description: command.commandName});

  const titles = [...groups.keys()].sort((a, b) => {
    const rank = (title: string) => (GROUP_ORDER.includes(title) ? GROUP_ORDER.indexOf(title) : GROUP_ORDER.length);
    return rank(a) - rank(b);
  });
  return titles.map((title) => ({title, items: groups.get(title) as ShortcutItem[]}));
};
