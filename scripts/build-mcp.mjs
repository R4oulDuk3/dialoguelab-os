import { chmod, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(root, "packages", "dialoguelab-mcp");
const output = join(packageRoot, "dist", "cli.js");
const resources = join(packageRoot, "resources");

await mkdir(dirname(output), { recursive: true });
await mkdir(resources, { recursive: true });
await build({
  entryPoints: [join(root, "mcp", "cli.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
});
await copyFile(join(root, "requirements-whisper.txt"), join(resources, "requirements-whisper.txt"));
await copyFile(join(root, "scripts", "whisper-worker.py"), join(resources, "whisper-worker.py"));
await chmod(output, 0o755);

console.log(`Built ${output}`);
