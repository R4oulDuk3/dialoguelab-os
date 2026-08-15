import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function defaultDataDirectory(): string {
  const home = homedir();
  if (process.platform === "win32") return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "DialogueLab");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "DialogueLab");
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "dialoguelab");
}

export function resolveDataDirectory(): string {
  return resolve(/* turbopackIgnore: true */ process.env.DIALOGUELAB_DATA_DIR || defaultDataDirectory());
}

export const dataDirectory = resolveDataDirectory();
