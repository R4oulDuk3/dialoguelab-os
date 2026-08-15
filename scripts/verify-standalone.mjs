import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const release = join(process.cwd(), "release", "dialoguelab");
const profile = await mkdtemp(join(tmpdir(), "dialoguelab-standalone-"));
const port = await availablePort();
const child = spawn(process.execPath, [join(release, "server.js")], {
  cwd: release,
  env: { ...process.env, DIALOGUELAB_DATA_DIR: profile, HOSTNAME: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

try {
  const docs = await waitFor(`http://127.0.0.1:${port}/docs`);
  assert.match(await docs.text(), /From first launch to a rendered conversation/);
  const providers = await fetch(`http://127.0.0.1:${port}/api/providers`);
  assert.equal(providers.status, 200);
  console.log(JSON.stringify({ ok: true, docs: true, api: true, privateProfile: true }, null, 2));
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`);
} finally {
  child.kill();
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(3_000)]);
  await rm(profile, { recursive: true, force: true });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* server is still starting */ }
    await delay(250);
  }
  throw new Error(`Standalone server did not become ready at ${url}.`);
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
