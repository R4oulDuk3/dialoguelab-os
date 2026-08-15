import { readFile } from "node:fs/promises";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const mcp = JSON.parse(await readFile(new URL("../packages/dialoguelab-mcp/package.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../src/shared/version.ts", import.meta.url), "utf8");
const sourceVersion = source.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];

if (root.version !== mcp.version || root.version !== sourceVersion) {
  throw new Error(`Version mismatch: app=${root.version}, MCP=${mcp.version}, source=${sourceVersion || "missing"}`);
}

console.log(`Version ${root.version} is synchronized.`);
