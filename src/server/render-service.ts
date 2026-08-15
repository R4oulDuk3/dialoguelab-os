import { copyFile, link, mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import type { ProjectRenderJobRecord, RenderQuality } from "@/shared/contracts";
import { dataDirectory } from "./database";
import { compileProjectToHyperframes } from "./hyperframes-composition";
import { fontService } from "./font-service";
import { renderRepository, type StoredRenderJob } from "./render-repository";
import { backgroundService, characterService, mediaService, projectService, speechService } from "./services";
import { dialogueBlocks } from "@/shared/project-timeline";

const require = createRequire(import.meta.url);
const gsapRuntimePath = require.resolve("gsap/dist/gsap.min.js");

const globalRender = globalThis as typeof globalThis & {
  __dialogueRenderWorker?: Promise<void>;
  __dialogueRenderControllers?: Map<string, AbortController>;
  __dialogueRenderRecovered?: boolean;
};

export const renderService = {
  start(localProjectId: string, quality: RenderQuality = "standard"): ProjectRenderJobRecord {
    if (!safeIdentifier(localProjectId)) throw new Error("Project ID is invalid.");
    if (!["draft", "standard", "high"].includes(quality)) throw new Error("Choose draft, standard, or high render quality.");
    const project = projectService.get(localProjectId); const id = crypto.randomUUID();
    const record = renderRepository.create({ id, project, quality, fileName: `${safeFileName(project.name)}.mp4`, storageName: `${id}.mp4` });
    ensureWorker(); return record;
  },
  list(localProjectId?: string): ProjectRenderJobRecord[] { ensureWorker(); return renderRepository.list(localProjectId); },
  get(renderId: string): ProjectRenderJobRecord | undefined { ensureWorker(); return renderRepository.list().find((job) => job.id === renderId); },
  cancel(renderId: string): ProjectRenderJobRecord {
    const job = renderRepository.get(renderId); if (!job) throw new Error("Render job not found.");
    if (["complete", "failed", "cancelled"].includes(job.status)) return job;
    const cancelled = renderRepository.update(renderId, { status: "cancelled", stage: "Cancelled", completedAt: new Date().toISOString(), workerPid: null });
    controllers().get(renderId)?.abort(); return cancelled;
  },
  retry(renderId: string): ProjectRenderJobRecord {
    const prior = renderRepository.get(renderId); if (!prior) throw new Error("Render job not found.");
    if (!["failed", "cancelled"].includes(prior.status)) throw new Error("Only failed or cancelled renders can be retried.");
    const id = crypto.randomUUID(); const record = renderRepository.create({ id, project: prior.projectSnapshot, quality: prior.quality, fileName: prior.fileName, storageName: `${id}.mp4` });
    ensureWorker(); return record;
  },
  async remove(renderId: string): Promise<void> {
    const job = renderRepository.get(renderId); if (!job) return;
    if (!["complete", "failed", "cancelled"].includes(job.status)) throw new Error("Cancel this render before removing it.");
    await unlink(outputPath(job)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); renderRepository.remove(renderId);
  },
  async output(localProjectId: string, renderId: string): Promise<{ path: string; size: number } | undefined> {
    if (!safeIdentifier(localProjectId) || !safeIdentifier(renderId)) return undefined; const job = renderRepository.get(renderId);
    if (!job || job.projectId !== localProjectId || job.status !== "complete") return undefined;
    const path = outputPath(job); try { return { path, size: (await stat(path)).size }; } catch { return undefined; }
  },
};

function ensureWorker(): void {
  if (!globalRender.__dialogueRenderRecovered) { renderRepository.recoverInterrupted(); globalRender.__dialogueRenderRecovered = true; }
  if (globalRender.__dialogueRenderWorker) return;
  globalRender.__dialogueRenderWorker = runQueue().finally(() => { globalRender.__dialogueRenderWorker = undefined; if (renderRepository.list().some((job) => job.status === "queued")) ensureWorker(); });
}

async function runQueue(): Promise<void> {
  for (;;) {
    const stored = renderRepository.claimNextQueued(process.pid); if (!stored) return;
    const controller = new AbortController(); controllers().set(stored.id, controller);
    try { await renderProjectNow(stored, controller.signal); }
    catch (error) {
      const current = renderRepository.get(stored.id); if (current?.status !== "cancelled") renderRepository.update(stored.id, { status: "failed", stage: "Render failed", error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString(), workerPid: null });
      await unlink(outputPath(stored)).catch(() => undefined);
    } finally { controllers().delete(stored.id); }
  }
}

async function renderProjectNow(renderRecord: StoredRenderJob, signal: AbortSignal): Promise<void> {
  const project = renderRecord.projectSnapshot;
  const characters = characterService.list(); const speechClips = speechService.list();
  const background = project.editorState.assets.backgroundId ? backgroundService.list().find((item) => item.id === project.editorState.assets.backgroundId) : undefined;
  if (project.editorState.assets.backgroundId && !background) throw new Error("The selected background is no longer available. Choose a replacement before rendering.");
  const characterById = new Map(characters.map((character) => [character.id, character]));
  for (const [index, line] of dialogueBlocks(project.editorState).entries()) {
    const character = characterById.get(line.data.characterId); if (!character) throw new Error(`Dialogue line ${index + 1} uses a missing character.`);
    if (!character.images.some((image) => image.id === line.data.characterImageId)) throw new Error(`Dialogue line ${index + 1} uses a missing character pose.`);
  }
  const localMediaIds = new Set(mediaService.list().map((asset) => asset.id));
  for (const item of project.editorState.timeline.items) {
    if (item.kind === "character-pose") { const character = item.characterId ? characterById.get(item.characterId) : undefined; if (!character || !character.images.some((image) => image.id === item.characterImageId)) throw new Error("A timeline character pose is missing."); }
    else if (item.kind !== "text" && (!item.assetId || !localMediaIds.has(item.assetId))) throw new Error("A timeline media asset is missing.");
  }
  const stagingRoot = join(dataDirectory, "render-jobs"); await mkdir(stagingRoot, { recursive: true }); const stagingDirectory = await mkdtemp(join(stagingRoot, `${renderRecord.id}-`));
  const assetDirectory = join(stagingDirectory, "assets"); await mkdir(assetDirectory, { recursive: true });
  const characterImageUrls = new Map<string, string>(); const speechUrls = new Map<string, string>(); const fontUrls = new Map<string, string>(); const fontFormats = new Map<string, string>();
  const mediaUrls = new Map<string, string>(); let backgroundUrl: string | undefined;
  try {
    for (const character of characters) for (const image of character.images) { const stored = characterService.image(image.id); if (!stored) continue; const fileName = `character-${image.id}${imageExtension(stored.mime_type)}`; await writeFile(join(assetDirectory, fileName), stored.image_data); characterImageUrls.set(image.id, `./assets/${fileName}`); }
    for (const speech of speechClips) { const stored = speechService.file(speech.id); if (!stored) continue; const fileName = `speech-${speech.id}${extname(stored.path) || audioExtension(speech.mimeType)}`; await linkOrCopy(stored.path, join(assetDirectory, fileName)); speechUrls.set(speech.id, `./assets/${fileName}`); }
    if (background) { const stored = backgroundService.file(background.id); if (!stored) throw new Error("The selected background video is missing from local storage."); const fileName = `background-${background.id}${extname(stored.path) || ".mp4"}`; await linkOrCopy(stored.path, join(assetDirectory, fileName)); backgroundUrl = `./assets/${fileName}`; }
    for (const media of mediaService.list()) { const stored = mediaService.file(media.id); if (!stored) continue; const fileName = `media-${media.id}${extname(stored.path) || extname(media.fileName) || ".media"}`; await linkOrCopy(stored.path, join(assetDirectory, fileName)); mediaUrls.set(media.id, `./assets/${fileName}`); }
    await writeFile(join(assetDirectory, "gsap.min.js"), await readFile(gsapRuntimePath));
    const font = fontService.asset(project.editorState.captions.fontFamily); if (!font) throw new Error(`Caption font “${project.editorState.captions.fontFamily}” is unavailable.`);
    const fontName = `caption-font${extname(font.path) || ".woff2"}`; await linkOrCopy(font.path, join(assetDirectory, fontName)); fontUrls.set(font.record.family, `./assets/${fontName}`); fontFormats.set(font.record.family, font.record.format);
    const composition = compileProjectToHyperframes({ project, characters, speechClips, background,
      assets: { gsapUrl: "./assets/gsap.min.js", backgroundUrl, characterImageUrls, speechUrls, mediaUrls, fontUrls, fontFormats } });
    if (!composition.renderable) {
      if (project.editorState.projectType === "fake-text") throw new Error(project.editorState.blocks.length ? "Fill every Fake Text message before rendering." : "Add at least one Fake Text message before rendering.");
      if (!project.editorState.blocks.length) throw new Error("Add at least one dialogue line before rendering."); throw new Error(`Generate audio for every dialogue line before rendering (${composition.missingSpeechLineIds.length} missing).`);
    }
    await writeFile(join(stagingDirectory, "index.html"), composition.html, "utf8");
    await writeFile(join(stagingDirectory, "caption-overrides.json"), "[]\n", "utf8");
    await mkdir(join(dataDirectory, "renders", project.id), { recursive: true });
    const producerJob = createRenderJob({ fps: project.editorState.canvas.fps, quality: renderRecord.quality, format: "mp4", workers: 1, entryFile: "index.html", hdrMode: "force-sdr", strictness: "best-effort" });
    await executeRenderJob(producerJob, stagingDirectory, outputPath(renderRecord), (job, message) => {
      const current = renderRepository.get(renderRecord.id); if (!current || current.status === "cancelled") return;
      renderRepository.update(renderRecord.id, { status: job.progress < 25 ? "preparing" : "rendering", progress: job.progress, stage: message || job.currentStage });
    }, signal);
    if (renderRepository.get(renderRecord.id)?.status === "cancelled") { await unlink(outputPath(renderRecord)).catch(() => undefined); return; }
    const rendered = await stat(outputPath(renderRecord)); renderRepository.update(renderRecord.id, { status: "complete", progress: 100, stage: "Render complete", sizeBytes: rendered.size, durationSeconds: composition.durationSeconds, completedAt: new Date().toISOString(), workerPid: null });
  } finally { await rm(stagingDirectory, { recursive: true, force: true }); }
}

function controllers(): Map<string, AbortController> { return globalRender.__dialogueRenderControllers ??= new Map(); }
function outputPath(job: Pick<StoredRenderJob, "projectId" | "storageName">): string { return join(dataDirectory, "renders", job.projectId, job.storageName); }
async function linkOrCopy(source: string, target: string): Promise<void> { try { await link(source, target); } catch { await copyFile(source, target); } }
function safeIdentifier(value: string): boolean { return /^[a-zA-Z0-9_-]+$/.test(value); }
function safeFileName(value: string): string { return value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "") || "dialogue-video"; }
function imageExtension(mimeType: string): string { return mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg"; }
function audioExtension(mimeType: string): string { return mimeType.includes("wav") ? ".wav" : mimeType.includes("ogg") ? ".ogg" : mimeType.includes("mpeg") ? ".mp3" : ".audio"; }
