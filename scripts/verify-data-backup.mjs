import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporary = await mkdtemp(join(tmpdir(), "dialoguelab-backup-test-"));
const data = join(temporary, "profile");
const backup = join(temporary, "backup");
await import("node:fs/promises").then(({ mkdir }) => mkdir(data, { recursive: true }));
await writeFile(join(data, "master.key"), "test-key");

try {
  run(["backup", "--output", backup]);
  await writeFile(join(data, "master.key"), "changed");
  run(["restore", "--from", backup, "--force"]);
  assert.equal(await readFile(join(data, "master.key"), "utf8"), "test-key");
  assert.equal(JSON.parse(await readFile(join(backup, "dialoguelab-backup.json"), "utf8")).format, 1);
  console.log(JSON.stringify({ ok: true, completeBackup: true, recoverableRestore: true }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function run(arguments_) {
  const child = spawnSync(process.execPath, [join(process.cwd(), "scripts", "data-backup.mjs"), ...arguments_], { env: { ...process.env, DIALOGUELAB_DATA_DIR: data }, encoding: "utf8", windowsHide: true });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || "Data command failed");
}
