import { readFile } from "node:fs/promises";

const paths = [
  new URL("../package.json", import.meta.url),
  new URL("../packages/dialoguelab-mcp/package.json", import.meta.url),
  new URL("../packages/dialoguelab-mcp/server.json", import.meta.url),
];
let root;
let mcp;
let registry;
try {
  [root, mcp, registry] = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    throw new Error("Release metadata is not prepared. Run npm run release:prepare -- --owner <github-owner> --repo dialoguelab --version <version>.");
  }
  throw error;
}
const serialized = JSON.stringify([root, mcp, registry]);
if (serialized.includes("OWNER")) throw new Error("Replace the OWNER placeholder before release.");
if (!root.repository?.url || !mcp.repository?.url || !mcp.mcpName) throw new Error("Release repository metadata is incomplete.");
if (root.version !== mcp.version || root.version !== registry.version || root.version !== registry.packages?.[0]?.version) {
  throw new Error("App, npm package, and MCP Registry versions must match.");
}
if (mcp.mcpName !== registry.name || mcp.name !== registry.packages?.[0]?.identifier) throw new Error("MCP package identifiers do not match.");
console.log(`Release metadata is ready for ${registry.repository.url} at ${root.version}.`);
