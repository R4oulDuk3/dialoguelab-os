import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const npm = process.env.npm_execpath ? { command: process.execPath, prefix: [process.env.npm_execpath] } : { command: "npm", prefix: [] };
const temporary = await mkdtemp(join(tmpdir(), "dialoguelab-packed-mcp-"));
const packageDirectory = join(process.cwd(), "packages", "dialoguelab-mcp");
try {
  const packed = spawnSync(npm.command, [...npm.prefix, "pack", packageDirectory, "--pack-destination", temporary], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout || "npm pack failed");
  const archive = (await readdir(temporary)).find((name) => name.endsWith(".tgz"));
  assert(archive, "npm pack did not create an archive");
  const installDirectory = join(temporary, "consumer");
  const installed = spawnSync(npm.command, [...npm.prefix, "install", join(temporary, archive), "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: temporary, encoding: "utf8", windowsHide: true });
  if (installed.status !== 0) throw new Error(installed.stderr || installed.stdout || "npm install failed");
  const installedPackage = join(temporary, "node_modules", "dialoguelab-mcp");
  const cli = join(installedPackage, "dist", "cli.js");
  await access(join(installedPackage, "resources", "requirements-whisper.txt"));
  await access(join(installedPackage, "resources", "whisper-worker.py"));
  const packageRequire = createRequire(pathToFileURL(cli));
  assert(packageRequire.resolve("gsap/dist/gsap.min.js"));

  const profile = join(temporary, "profile");
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli], env: { ...process.env, DIALOGUELAB_DATA_DIR: profile }, stderr: "pipe" });
  const client = new Client({ name: "packed-dialoguelab-verifier", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert(tools.tools.some((tool) => tool.name === "get_app_status"));
    const status = await client.callTool({ name: "get_app_status", arguments: {} });
    assert.notEqual(status.isError, true);
    console.log(JSON.stringify({ ok: true, archive, toolCount: tools.tools.length, resources: 2, gsapResolved: true }, null, 2));
  } finally {
    await client.close();
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
