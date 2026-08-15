import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npm = process.env.npm_execpath ? { command: process.execPath, prefix: [process.env.npm_execpath] } : { command: "npm", prefix: [] };
const scripts = [
  "check:privacy",
  "check:versions",
  "check",
  "verify:database-migrations",
  "verify:production-guards",
  "verify:data-backup",
  "verify:projects",
  "verify:editor-history",
  "verify:dialogue-timeline",
  "verify:freeform-timeline",
  "verify:p0-editor",
  "verify:visual-motion",
  "verify:animation-picker",
  "verify:dialogue-parity",
  "verify:parity-completion",
  "verify:character-edit",
  "verify:tts",
  "verify:character-mcp",
  "verify:project-mcp",
  "verify:tts-mcp",
  "verify:background-mcp",
];

for (const script of scripts) {
  const profile = mkdtempSync(join(tmpdir(), `dialoguelab-${script.replaceAll(":", "-")}-`));
  console.log(`\n> npm run ${script}`);
  const child = spawnSync(npm.command, [...npm.prefix, "run", script], {
    cwd: process.cwd(),
    env: { ...process.env, DIALOGUELAB_DATA_DIR: profile },
    stdio: "inherit",
    windowsHide: true,
  });
  rmSync(profile, { recursive: true, force: true });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}

console.log("\nAll isolated tests passed.");
