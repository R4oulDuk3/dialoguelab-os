import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "release", "dialoguelab");
const standalone = join(root, ".next", "standalone");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(standalone, output, { recursive: true, dereference: true, filter: (source) => shouldCopyStandalone(relative(standalone, source)) });
await mkdir(join(output, ".next"), { recursive: true });
await cp(join(root, ".next", "static"), join(output, ".next", "static"), { recursive: true });
await cp(join(root, "public"), join(output, "public"), { recursive: true });
await cp(join(root, "requirements-whisper.txt"), join(output, "requirements-whisper.txt"));
await mkdir(join(output, "scripts"), { recursive: true });
await cp(join(root, "scripts", "whisper-worker.py"), join(output, "scripts", "whisper-worker.py"));

const packagedFiles = await readdir(output, { recursive: true, withFileTypes: true });
const privateFiles = packagedFiles.filter((entry) => entry.isFile() && isPrivatePath(relative(output, join(entry.parentPath, entry.name))));
if (privateFiles.length) throw new Error(`Private data entered the standalone release: ${privateFiles.map((entry) => entry.name).join(", ")}`);

console.log(`Standalone release assembled at ${output}`);

function isPrivatePath(path) {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  const name = basename(normalized).toLowerCase();
  return ["data", "assets", "tmp", ".venv"].includes((segments[0] || "").toLowerCase())
    || /^\.env(?:\..+)?$/i.test(name)
    || name === "master.key"
    || [".sqlite", ".db", ".pem", ".key", ".p12", ".pfx"].includes(extname(name).toLowerCase())
    || /\.(?:sqlite|db)-(?:shm|wal)$/i.test(name);
}

function shouldCopyStandalone(path) {
  const normalized = path.replaceAll("\\", "/");
  const topLevel = normalized.split("/").filter(Boolean)[0];
  return !topLevel || [".next", "node_modules", "package.json", "server.js"].includes(topLevel);
}
