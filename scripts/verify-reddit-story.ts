import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { SpeechClipRecord } from "../src/shared/contracts";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-reddit-story-"));
const keepArtifacts = process.argv.includes("--keep-artifacts"); const execFileAsync = promisify(execFile); const require = createRequire(import.meta.url);
process.env.DIALOGUELAB_DATA_DIR = directory;
let closeDatabase: (() => void) | undefined;
try {
  const database = await import("../src/server/database"); const projectDb = database.db(); closeDatabase = () => projectDb.close();
  const { backgroundRepository } = await import("../src/server/background-repository");
  const defaultBackground = backgroundRepository.create({ id: crypto.randomUUID(), name: "Default gameplay", description: "", fileName: "gameplay.mp4", storageName: "gameplay.mp4", mimeType: "video/mp4", sizeBytes: 1, width: 1080, height: 1920, durationSeconds: 30, createdAt: new Date().toISOString() });
  const { projectService } = await import("../src/server/services"); const { compileProjectToHyperframes } = await import("../src/server/hyperframes-composition");
  const created = projectService.create({ name: "Reddit story test", description: "", projectType: "reddit-story", width: 1080, height: 1920, fps: 30 });
  const line = created.editorState.blocks.find((block) => block.kind === "dialogue-line");
  if (created.editorState.projectType !== "reddit-story" || !line?.data.redditPost) throw new Error("Reddit Story project seed was not created.");
  if (created.editorState.assets.backgroundId !== defaultBackground.id) throw new Error("The first background was not selected for the Reddit Story project.");
  const speech: SpeechClipRecord = { id: crypto.randomUUID(), voiceName: "Narrator", provider: "elevenlabs", providerVoiceId: "test", text: String(line.data.text), model: "test", speed: "fast", mimeType: "audio/mpeg", sizeBytes: 10, durationSeconds: 4,
    words: [{ text: "Paste", type: "word", startSeconds: 0, endSeconds: .5 }], timingSource: "provider", audioUrl: "/speech.mp3", createdAt: new Date().toISOString() };
  const project = { ...created, editorState: { ...created.editorState, blocks: created.editorState.blocks.map((block) => block.id === line.id ? { ...block, data: { ...block.data, narratorVoiceId: crypto.randomUUID(), speechClipId: speech.id } } : block) } };
  await copyFile(require.resolve("gsap/dist/gsap.min.js"), join(directory, "gsap.min.js"));
  await writeFile(join(directory, "speech.wav"), makeWav(4));
  const composition = compileProjectToHyperframes({ project, characters: [], speechClips: [speech], assets: { gsapUrl: "./gsap.min.js", characterImageUrls: new Map(), speechUrls: new Map([[speech.id, "./speech.wav"]]) } });
  if (!composition.renderable || !composition.html.includes("reddit-card-motion") || !composition.html.includes("Reddit post") || !composition.html.includes("dialogue-caption")) throw new Error("Reddit Story HyperFrames composition was not generated correctly.");
  await writeFile(join(directory, "index.html"), composition.html);
  await writeFile(join(directory, "caption-overrides.json"), "[]\n");
  const cli = join(process.cwd(), "node_modules", "hyperframes", "bin", "hyperframes.mjs");
  const checked = await execFileAsync(process.execPath, [cli, "check", directory, "--json", "--at", "0.8", "--snapshots"], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  const report = JSON.parse(checked.stdout) as { summary?: { errors?: number } }; if (report.summary?.errors) throw new Error(checked.stdout);
  console.log(JSON.stringify({ projectType: created.editorState.projectType, canvas: created.editorState.canvas, durationSeconds: composition.durationSeconds, renderable: composition.renderable, checkErrors: report.summary?.errors ?? 0, ...(keepArtifacts ? { artifacts: directory } : {}) }, null, 2));
} finally { closeDatabase?.(); if (!keepArtifacts) await rm(directory, { recursive: true, force: true }); }

function makeWav(durationSeconds: number): Buffer {
  const rate = 8_000; const samples = Math.ceil(rate * durationSeconds); const bytes = samples * 2; const buffer = Buffer.alloc(44 + bytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + bytes, 4); buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(bytes, 40); return buffer;
}
