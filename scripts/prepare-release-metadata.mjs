import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) options.set(process.argv[index], process.argv[index + 1]);
const owner = options.get("--owner");
const repositoryName = options.get("--repo") || "dialoguelab";
const requestedVersion = options.get("--version");

if (!owner || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
  throw new Error("Pass a permanent GitHub owner with --owner <name>.");
}
if (!/^[A-Za-z0-9._-]+$/.test(repositoryName)) throw new Error("The repository name is invalid.");
if (requestedVersion && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion)) throw new Error("Use a semantic version such as 0.1.0.");

const rootPackagePath = join(root, "package.json");
const mcpPackagePath = join(root, "packages", "dialoguelab-mcp", "package.json");
const sourceVersionPath = join(root, "src", "shared", "version.ts");
const rootPackage = JSON.parse(await readFile(rootPackagePath, "utf8"));
const mcpPackage = JSON.parse(await readFile(mcpPackagePath, "utf8"));
const version = requestedVersion || rootPackage.version;
const repositoryUrl = `https://github.com/${owner}/${repositoryName}`;
const mcpName = `io.github.${owner}/${repositoryName}`;

rootPackage.version = version;
rootPackage.repository = { type: "git", url: `git+${repositoryUrl}.git` };
rootPackage.homepage = `${repositoryUrl}#readme`;
rootPackage.bugs = { url: `${repositoryUrl}/issues` };
mcpPackage.version = version;
mcpPackage.repository = rootPackage.repository;
mcpPackage.homepage = rootPackage.homepage;
mcpPackage.bugs = rootPackage.bugs;
mcpPackage.mcpName = mcpName;

const registry = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: mcpName,
  description: mcpPackage.description,
  repository: { url: repositoryUrl, source: "github" },
  version,
  packages: [{
    registryType: "npm",
    identifier: mcpPackage.name,
    version,
    transport: { type: "stdio" },
    environmentVariables: [{
      description: "Optional directory shared with a Dialogue Lab installation",
      isRequired: false,
      format: "string",
      isSecret: false,
      name: "DIALOGUELAB_DATA_DIR",
    }],
  }],
};

await writeFile(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);
await writeFile(mcpPackagePath, `${JSON.stringify(mcpPackage, null, 2)}\n`);
await writeFile(sourceVersionPath, `export const APP_VERSION = ${JSON.stringify(version)};\n`);
await writeFile(join(root, "packages", "dialoguelab-mcp", "server.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Prepared ${repositoryUrl} at version ${version}. Review and commit the generated metadata.`);
