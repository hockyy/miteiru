import fs from "node:fs";

/**
 * Miteiru's settings (config.json in the user data folder) for the headless server: read-only, and read
 * again when the file changes, so Your dictionary, the tone setting and the last chosen language follow
 * what the learner sets in the app. The app owns the file and writes it whole (store.ts writes a temp
 * file and renames it), so a read never sees half a file; a write here would race the app's and is
 * refused.
 */
type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

const RECHECK_MS = 500;

export class SettingsStore {
  private data: Json = {};
  private stamp = "";
  private checkedAt = -Infinity;

  constructor(private readonly file: string, private readonly now: () => number = Date.now) {}

  private refresh() {
    if (this.now() - this.checkedAt < RECHECK_MS) return;
    this.checkedAt = this.now();
    let stamp = "";
    try {
      const stat = fs.statSync(this.file);
      stamp = `${stat.mtimeMs}:${stat.size}`;
    } catch {
      this.data = {};
      this.stamp = "";
      return;
    }
    if (stamp === this.stamp) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.data = isObject(parsed) ? parsed : {};
      this.stamp = stamp;
    } catch {
      // Being replaced right now, or damaged: keep what was read last, and look again next time.
      this.checkedAt = -Infinity;
    }
  }

  get<T = unknown>(key: string, defaultValue?: T): T {
    this.refresh();
    let current: unknown = this.data;
    for (const segment of key.split(".")) {
      if (!isObject(current) || !(segment in current)) return defaultValue as T;
      current = current[segment];
    }
    return (current === undefined ? defaultValue : current) as T;
  }

  set(key: string): void {
    throw new Error(`The headless server does not change Miteiru's settings (asked to set ${key}).`);
  }
}
