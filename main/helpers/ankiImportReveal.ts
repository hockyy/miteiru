import { spawn } from "node:child_process";
import * as fsPromises from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { shell } from "../../renderer/platform/backend/shims/desktop";

type AnkiInstall =
  | { type: "open-path"; path: string }
  | { type: "command"; command: string; args: string[] };

export interface RevealAnkiImportResult {
  ok: boolean;
  filePath?: string;
  folderRevealed?: boolean;
  ankiLaunched?: boolean;
  openedFolderOnly?: boolean;
  error?: string;
}

const exists = (candidate: string) => fsPromises.access(candidate).then(() => true, () => false);

/** Runs a short command to completion; null when it cannot be started. */
const runCapture = (command: string, args: string[]) => new Promise<{ status: number | null; stdout: string } | null>((resolve) => {
  try {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.once("error", () => resolve(null));
    child.once("close", (status) => resolve({ status, stdout }));
  } catch {
    resolve(null);
  }
});

/** Strip path segments and unsafe characters from export filenames. */
export const sanitizeAnkiFilename = (filename: string) => {
  const base = path.basename(String(filename || "miteiru_anki_import.tsv"));
  const sanitized = base.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  return sanitized || "miteiru_anki_import.tsv";
};

const firstExisting = async (candidates: string[]) => {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
};

const findWindowsAnki = async (): Promise<AnkiInstall | null> => {
  const found = await firstExisting([
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs", "Anki", "anki.exe")
      : "",
    "C:\\Program Files\\Anki\\anki.exe",
    "C:\\Program Files (x86)\\Anki\\anki.exe",
  ].filter(Boolean));

  return found ? { type: "open-path", path: found } : null;
};

const findMacAnki = async (): Promise<AnkiInstall | null> => {
  const found = await firstExisting([
    "/Applications/Anki.app",
    path.join(homedir(), "Applications", "Anki.app"),
  ]);
  if (found) {
    return { type: "open-path", path: found };
  }

  // mdfind unavailable (null) or no match: fall back to `open -a Anki`
  const spotlight = await runCapture("mdfind", ["kMDItemCFBundleIdentifier == \"net.ankiweb.dtop\""]);
  for (const line of spotlight?.stdout.split("\n").map((entry) => entry.trim()) ?? []) {
    if (line.endsWith(".app") && await exists(line)) {
      return { type: "open-path", path: line };
    }
  }

  return { type: "command", command: "open", args: ["-a", "Anki"] };
};

const findLinuxAnki = async (): Promise<AnkiInstall | null> => {
  const found = await firstExisting([
    "/usr/bin/anki",
    "/usr/local/bin/anki",
    path.join(homedir(), ".local", "bin", "anki"),
    "/snap/bin/anki",
  ]);
  if (found) {
    return { type: "open-path", path: found };
  }

  const whichResult = await runCapture("which", ["anki"]);
  const resolved = whichResult?.stdout.trim();
  if (whichResult?.status === 0 && resolved && await exists(resolved)) {
    return { type: "open-path", path: resolved };
  }

  const flatpakInfo = await runCapture("flatpak", ["info", "net.anki.Anki"]);
  if (flatpakInfo?.status === 0) {
    return { type: "command", command: "flatpak", args: ["run", "net.anki.Anki"] };
  }

  return null;
};

export const findAnkiInstall = (): Promise<AnkiInstall | null> => {
  if (process.platform === "win32") {
    return findWindowsAnki();
  }
  if (process.platform === "darwin") {
    return findMacAnki();
  }
  return findLinuxAnki();
};

export const launchAnkiInstall = async (install: AnkiInstall): Promise<boolean> => {
  if (install.type === "open-path") {
    const errorMessage = await shell.openPath(install.path);
    if (errorMessage) {
      console.warn("Could not launch Anki via openPath:", errorMessage);
      return false;
    }
    return true;
  }

  // spawn reports a missing command through an 'error' event, which would otherwise be unhandled.
  return new Promise((resolve) => {
    try {
      const child = spawn(install.command, install.args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
      child.once("error", (error) => {
        console.warn("Could not launch Anki via command:", error);
        resolve(false);
      });
    } catch (error) {
      console.warn("Could not launch Anki via command:", error);
      resolve(false);
    }
  });
};

export const revealFileInFolder = async (filePath: string) => {
  const absolutePath = path.resolve(filePath);

  try {
    await shell.showItemInFolder(absolutePath);
    return { ok: true, openedFolderOnly: false };
  } catch (error) {
    console.warn("showItemInFolder failed, opening parent folder:", error);
  }

  const folderPath = path.dirname(absolutePath);
  const folderError = await shell.openPath(folderPath);
  if (folderError) {
    return {
      ok: false,
      error: folderError,
    };
  }

  return { ok: true, openedFolderOnly: true };
};

export async function revealAnkiImportFile(
  appDataDirectory: string,
  content: string,
  filename: string,
): Promise<RevealAnkiImportResult> {
  try {
    const ankiDir = path.join(appDataDirectory, "anki");
    await fsPromises.mkdir(ankiDir, { recursive: true });

    const safeFilename = sanitizeAnkiFilename(filename);
    const filePath = path.join(ankiDir, safeFilename);
    await fsPromises.writeFile(filePath, content, "utf8");
    await fsPromises.access(filePath);

    const revealResult = await revealFileInFolder(filePath);
    if (!revealResult.ok) {
      return {
        ok: false,
        filePath,
        error: revealResult.error || "Could not reveal import file in file manager.",
      };
    }

    const ankiInstall = await findAnkiInstall();
    const ankiLaunched = ankiInstall ? await launchAnkiInstall(ankiInstall) : false;

    return {
      ok: true,
      filePath,
      folderRevealed: true,
      ankiLaunched,
      openedFolderOnly: revealResult.openedFolderOnly,
    };
  } catch (error) {
    console.error("Error preparing Anki import file:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
