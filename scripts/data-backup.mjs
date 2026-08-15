import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDirectory } from "./lib/data-directory.mjs";

const command = process.argv[2];
const options = new Map();
for (let index = 3; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) { options.set(key, next); index += 1; }
  else options.set(key, "true");
}
const sourceData = dataDirectory();

if (command === "backup") {
  const outputValue = options.get("--output");
  if (!outputValue) throw new Error("Pass an empty destination directory with --output <path>.");
  const output = resolve(outputValue);
  assertSeparate(sourceData, output);
  if (isInside(process.cwd(), output)) throw new Error("Store backups outside the source repository.");
  if (existsSync(output)) throw new Error(`Backup destination already exists: ${output}`);
  if (existsSync(join(sourceData, "dialoguelab.sqlite"))) {
    const database = new DatabaseSync(join(sourceData, "dialoguelab.sqlite"));
    try { database.exec("PRAGMA wal_checkpoint(FULL)"); } finally { database.close(); }
  }
  await mkdir(dirname(output), { recursive: true });
  if (existsSync(sourceData)) await cp(sourceData, output, { recursive: true, errorOnExist: true });
  else await mkdir(output, { recursive: true });
  await writeFile(join(output, "dialoguelab-backup.json"), `${JSON.stringify({ format: 1, createdAt: new Date().toISOString(), sourceDirectoryName: basename(sourceData) }, null, 2)}\n`, { flag: "wx" });
  console.log(`Backup created at ${output}. It includes the encryption key; store it securely.`);
} else if (command === "restore") {
  const fromValue = options.get("--from");
  if (!fromValue || options.get("--force") !== "true") throw new Error("Pass --from <backup> --force true. Stop Dialogue Lab before restoring.");
  const source = resolve(fromValue);
  assertSeparate(source, sourceData);
  const manifest = JSON.parse(await readFile(join(source, "dialoguelab-backup.json"), "utf8"));
  if (manifest.format !== 1) throw new Error("Unsupported Dialogue Lab backup format.");
  await stat(source);
  let recovery;
  if (existsSync(sourceData)) {
    recovery = `${sourceData}.before-restore-${new Date().toISOString().replaceAll(":", "-")}`;
    await rename(sourceData, recovery);
  }
  await mkdir(dirname(sourceData), { recursive: true });
  try {
    await cp(source, sourceData, { recursive: true, errorOnExist: true, filter: (path) => basename(path) !== "dialoguelab-backup.json" });
  } catch (error) {
    await rm(sourceData, { recursive: true, force: true });
    if (recovery) await rename(recovery, sourceData);
    throw error;
  }
  console.log(`Restored Dialogue Lab data to ${sourceData}.${recovery ? ` Previous data is recoverable at ${recovery}.` : ""}`);
} else {
  throw new Error("Use backup or restore.");
}

function assertSeparate(first, second) {
  if (isInside(first, second) || isInside(second, first)) {
    throw new Error("Source and destination must be separate directories.");
  }
}

function isInside(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}
