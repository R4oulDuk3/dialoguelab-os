import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function defaultDataDirectory() {
  const home = homedir();
  if (process.platform === "win32") return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "DialogueLab");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "DialogueLab");
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "dialoguelab");
}

export function dataDirectory() {
  return resolve(process.env.DIALOGUELAB_DATA_DIR || defaultDataDirectory());
}
