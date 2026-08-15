import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(root, "node_modules", "@hyperframes", "studio", "dist", "assets");
const target = join(root, "src", "hyperframes-studio.generated.css");
const candidates = (await readdir(sourceDirectory)).filter((name) => name.endsWith(".css"));

if (candidates.length !== 1) throw new Error(`Expected one HyperFrames Studio stylesheet, found ${candidates.length}.`);
await mkdir(dirname(target), { recursive: true });
await copyFile(join(sourceDirectory, candidates[0]), target);
console.log(`Synchronized HyperFrames Studio ${candidates[0]}.`);
