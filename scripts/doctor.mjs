import { spawnSync } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./lib/data-directory.mjs";

const checks = [];
const major = Number(process.versions.node.split(".")[0]);
checks.push({ name: "Node.js", ok: major >= 22, detail: process.version });

for (const command of ["ffmpeg", "ffprobe"]) {
  const probe = spawnSync(command, ["-version"], { encoding: "utf8", windowsHide: true });
  checks.push({ name: command, ok: probe.status === 0, detail: probe.status === 0 ? (probe.stdout.split(/\r?\n/)[0] || "available") : "not found on PATH" });
}

const directory = dataDirectory();
const probePath = join(directory, `.doctor-${process.pid}`);
try {
  await mkdir(directory, { recursive: true });
  await access(directory, constants.R_OK | constants.W_OK);
  await writeFile(probePath, "Dialogue Lab write test", { flag: "wx" });
  await rm(probePath, { force: true });
  checks.push({ name: "Private data directory", ok: true, detail: directory });
} catch (error) {
  checks.push({ name: "Private data directory", ok: false, detail: error instanceof Error ? error.message : String(error) });
}

const python = spawnSync(process.env.DIALOGUELAB_SYSTEM_PYTHON || "python", ["--version"], { encoding: "utf8", windowsHide: true });
checks.push({ name: "Python (optional subtitles)", ok: python.status === 0, optional: true, detail: (python.stdout || python.stderr || "not found").trim() });

for (const check of checks) console.log(`${check.ok ? "OK" : check.optional ? "OPTIONAL" : "ERROR"}  ${check.name}: ${check.detail}`);
if (checks.some((check) => !check.ok && !check.optional)) process.exitCode = 1;
