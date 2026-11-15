import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where an installed Miteiru keeps the learner's data and language packs, as the app finds them
 * (src-tauri/src/sys/info.rs user_data_dir, src-tauri/src/sys/langpack.rs root_dir):
 *
 *   user data       MITEIRU_USER_DATA_DIR, else <config dir>/miteiru (a development build: "miteiru (development)")
 *   language packs  <MITEIRU_USER_DATA_DIR>/language-packs, else <local data dir>/id.hocky.miteiru/language-packs
 */

const IDENTIFIER = "id.hocky.miteiru";

/** dirs::config_dir(): %APPDATA%, ~/Library/Application Support, $XDG_CONFIG_HOME or ~/.config. */
export const configDir = (env: NodeJS.ProcessEnv = process.env, platform = process.platform, home = os.homedir()) => {
  if (platform === "win32") return env.APPDATA || path.join(home, "AppData", "Roaming");
  if (platform === "darwin") return path.join(home, "Library", "Application Support");
  return env.XDG_CONFIG_HOME || path.join(home, ".config");
};

/** Tauri's app_local_data_dir: %LOCALAPPDATA%, ~/Library/Application Support, $XDG_DATA_HOME or ~/.local/share, then the identifier. */
export const localDataDir = (env: NodeJS.ProcessEnv = process.env, platform = process.platform, home = os.homedir()) => {
  const base = platform === "win32" ? env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    : platform === "darwin" ? path.join(home, "Library", "Application Support")
      : env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(base, IDENTIFIER);
};

export interface ProfileOptions {
  /** A profile folder given on the command line; wins over MITEIRU_USER_DATA_DIR. */
  profile?: string;
  /** Read a development build's profile ("miteiru (development)"). */
  development?: boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

export interface Profile {
  /** The learner's data: config.json, learningStateDB, the local API registration. */
  userData: string;
  /** Installed language packs. */
  languagePacks: string;
  /** Whether the folder was named explicitly (its packs live inside it then). */
  explicit: boolean;
}

export const resolveProfile = ({profile, development = false, env = process.env, platform = process.platform, home = os.homedir()}: ProfileOptions = {}): Profile => {
  const explicit = profile || env.MITEIRU_USER_DATA_DIR || "";
  if (explicit) {
    const userData = path.resolve(explicit);
    return {userData, languagePacks: path.join(userData, "language-packs"), explicit: true};
  }
  return {
    userData: path.join(configDir(env, platform, home), development ? "miteiru (development)" : "miteiru"),
    languagePacks: path.join(localDataDir(env, platform, home), "language-packs"),
    explicit: false
  };
};

interface PackInfo {
  id: string;
  installedAt: number;
}

/**
 * The installed packs' language-assets folders, newest install of each pack (langpack.rs installs and
 * newest_install): a folder counts only once its pack.json is there, which an install writes last, and
 * `.partial-*` unpackings are skipped. Each root is asked only for the plugin folders it carries.
 */
export const installedPackRoots = (root: string): Array<{dir: string; plugins: string[]}> => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, {withFileTypes: true});
  } catch {
    return [];
  }
  const newest = new Map<string, {dir: string; info: PackInfo; name: string}>();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".partial-")) continue;
    const dir = path.join(root, entry.name);
    let info: PackInfo;
    try {
      info = JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8"));
    } catch {
      continue;
    }
    if (!info?.id || !fs.existsSync(path.join(dir, "language-assets"))) continue;
    const installedAt = Number(info.installedAt) || 0;
    const current = newest.get(info.id);
    if (!current || installedAt > current.info.installedAt || (installedAt === current.info.installedAt && entry.name > current.name)) {
      newest.set(info.id, {dir, info: {...info, installedAt}, name: entry.name});
    }
  }
  return [...newest.values()].map(({dir}) => {
    const assets = path.join(dir, "language-assets");
    const plugins = fs.readdirSync(assets, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return {dir: assets, plugins};
  });
};

export interface RunningApp {
  host: string;
  port: number;
  token: string;
  pid: number;
  startedAt: number;
}

/**
 * The running app's local API, from its analyzer-server.json (docs/LOCAL_API.md), newest first. A
 * registration whose process is gone is skipped: Miteiru doesn't delete the file when it closes, and a
 * refused connection costs about 2 seconds on Windows.
 */
export const runningApps = (dirs: string[], alive: (pid: number) => boolean = processAlive): RunningApp[] => {
  const apps: RunningApp[] = [];
  for (const dir of dirs) {
    try {
      const registration = JSON.parse(fs.readFileSync(path.join(dir, "analyzer-server.json"), "utf8"));
      if (!["127.0.0.1", "localhost"].includes(registration?.host)) continue;
      const port = Number(registration.port);
      if (!Number.isInteger(port) || port <= 0 || port > 65535 || typeof registration.token !== "string") continue;
      const pid = Number(registration.pid);
      if (Number.isInteger(pid) && pid > 0 && !alive(pid)) continue;
      apps.push({host: registration.host, port, token: registration.token, pid, startedAt: Number(registration.startedAt) || 0});
    } catch {
      // No registration here.
    }
  }
  return apps.sort((a, b) => b.startedAt - a.startedAt);
};

/** Whether a process with this id exists (signal 0 checks without signalling). */
export const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
};

/** The folders a running Miteiru may keep its registration in: the profile, else a release's and a development build's. */
export const registrationDirs = (profile: Profile, options: ProfileOptions = {}) => (
  profile.explicit ? [profile.userData] : [
    resolveProfile({...options, development: false}).userData,
    resolveProfile({...options, development: true}).userData
  ]
);
