import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { shell } from "electron";

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

const exists = (candidate: string) => {
  try {
    fs.accessSync(candidate);
    return true;
  } catch {
    return false;
  }
};

/** Strip path segments and unsafe characters from export filenames. */
export const sanitizeAnkiFilename = (filename: string) => {
  const base = path.basename(String(filename || "miteiru_anki_import.tsv"));
  const sanitized = base.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  return sanitized || "miteiru_anki_import.tsv";
};

const findWindowsAnki = (): AnkiInstall | null => {
  const candidates = [
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs", "Anki", "anki.exe")
      : "",
    "C:\\Program Files\\Anki\\anki.exe",
    "C:\\Program Files (x86)\\Anki\\anki.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return { type: "open-path", path: candidate };
    }
  }

  return null;
};

const findMacAnki = (): AnkiInstall | null => {
  const candidates = [
    "/Applications/Anki.app",
    path.join(homedir(), "Applications", "Anki.app"),
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return { type: "open-path", path: candidate };
    }
  }

  try {
    const spotlight = spawnSync(
      "mdfind",
      ["kMDItemCFBundleIdentifier == \"net.ankiweb.dtop\""],
      { encoding: "utf8" },
    );
    const match = spotlight.stdout
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line.endsWith(".app") && exists(line));
    if (match) {
      return { type: "open-path", path: match };
    }
  } catch {
    // mdfind unavailable — fall back to `open -a Anki`
  }

  return { type: "command", command: "open", args: ["-a", "Anki"] };
};

const findLinuxAnki = (): AnkiInstall | null => {
  const pathCandidates = [
    "/usr/bin/anki",
    "/usr/local/bin/anki",
    path.join(homedir(), ".local", "bin", "anki"),
    "/snap/bin/anki",
  ];

  for (const candidate of pathCandidates) {
    if (exists(candidate)) {
      return { type: "open-path", path: candidate };
    }
  }

  try {
    const whichResult = spawnSync("which", ["anki"], { encoding: "utf8" });
    const resolved = whichResult.stdout?.trim();
    if (whichResult.status === 0 && resolved && exists(resolved)) {
      return { type: "open-path", path: resolved };
    }
  } catch {
    // which not available
  }

  try {
    const flatpakInfo = spawnSync("flatpak", ["info", "net.anki.Anki"], { encoding: "utf8" });
    if (flatpakInfo.status === 0) {
      return { type: "command", command: "flatpak", args: ["run", "net.anki.Anki"] };
    }
  } catch {
    // flatpak not available
  }

  return null;
};

export const findAnkiInstall = (): AnkiInstall | null => {
  if (process.platform === "win32") {
    return findWindowsAnki();
  }
  if (process.platform === "darwin") {
    return findMacAnki();
  }
  return findLinuxAnki();
};

export const launchAnkiInstall = (install: AnkiInstall): boolean => {
  if (install.type === "open-path") {
    const errorMessage = shell.openPath(install.path);
    if (errorMessage) {
      console.warn("Could not launch Anki via openPath:", errorMessage);
      return false;
    }
    return true;
  }

  try {
    const child = spawn(install.command, install.args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch (error) {
    console.warn("Could not launch Anki via command:", error);
    return false;
  }
};

export const revealFileInFolder = (filePath: string) => {
  const absolutePath = path.resolve(filePath);

  try {
    shell.showItemInFolder(absolutePath);
    return { ok: true, openedFolderOnly: false };
  } catch (error) {
    console.warn("showItemInFolder failed, opening parent folder:", error);
  }

  const folderPath = path.dirname(absolutePath);
  const folderError = shell.openPath(folderPath);
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

    const revealResult = revealFileInFolder(filePath);
    if (!revealResult.ok) {
      return {
        ok: false,
        filePath,
        error: revealResult.error || "Could not reveal import file in file manager.",
      };
    }

    const ankiInstall = findAnkiInstall();
    const ankiLaunched = ankiInstall ? launchAnkiInstall(ankiInstall) : false;

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
