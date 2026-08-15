import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagedResources = join(packageRoot, "resources");

if (!process.env.DIALOGUELAB_WHISPER_REQUIREMENTS && existsSync(join(packagedResources, "requirements-whisper.txt"))) {
  process.env.DIALOGUELAB_WHISPER_REQUIREMENTS = join(packagedResources, "requirements-whisper.txt");
}
if (!process.env.DIALOGUELAB_WHISPER_WORKER && existsSync(join(packagedResources, "whisper-worker.py"))) {
  process.env.DIALOGUELAB_WHISPER_WORKER = join(packagedResources, "whisper-worker.py");
}

if (!process.env.DIALOGUELAB_DATA_DIR) {
  const home = homedir();
  process.env.DIALOGUELAB_DATA_DIR = process.platform === "win32"
    ? join(process.env.APPDATA || join(home, "AppData", "Roaming"), "DialogueLab")
    : process.platform === "darwin"
      ? join(home, "Library", "Application Support", "DialogueLab")
      : join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "dialoguelab");
}

await import("./server");
