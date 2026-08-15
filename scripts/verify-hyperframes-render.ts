import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { compileProjectToHyperframes } from "../src/server/hyperframes-composition";
import { captionFontPath } from "../src/server/font-assets";
import type { CharacterRecord, ProjectRecord, SpeechClipRecord } from "../src/shared/contracts";
import { DEFAULT_CAPTION_STYLE } from "../src/shared/project-timeline";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "dialoguelab-hyperframes-"));
const keepArtifacts = process.argv.includes("--keep-artifacts");
const assets = join(directory, "assets");
await mkdir(assets);

try {
  const characterId = crypto.randomUUID(); const imageId = crypto.randomUUID(); const voiceId = crypto.randomUUID(); const speechId = crypto.randomUUID(); const lineId = crypto.randomUUID(); const projectId = crypto.randomUUID();
  const project: ProjectRecord = {
    id: projectId, name: "HyperFrames verification", description: "", revision: 0, canUndo: false, canRedo: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    editorState: { schemaVersion: 7, projectType: "dialogue", canvas: { width: 640, height: 360, fps: 30 }, assets: { backgroundStartSeconds: 0, characterIds: [characterId] }, captions: { ...DEFAULT_CAPTION_STYLE, fontSizePx: 32, verticalPositionPx: 320 }, captionAnimation: { preset: "pop", durationSeconds: .16 }, timeline: { mode: "flow", tracks: [], items: [{ id: "overlay-item", kind: "image", assetId: "overlay-asset", trackId: "overlays", startSeconds: .2, durationSeconds: .8, sourceStartSeconds: 0, volume: 1, playbackRate: 1, muted: false, loop: false, locked: false, hidden: false, transform: { xPercent: 80, yPercent: 20, widthPercent: 15, heightPercent: 15, rotationDegrees: 0, opacity: 1, zIndex: 8 }, motion: { entrance: { preset: "pop", durationSeconds: .2, easing: "smooth", direction: "up" }, during: { preset: "none", durationSeconds: .35, easing: "smooth", direction: "up" }, exit: { preset: "fade", durationSeconds: .15, easing: "smooth", direction: "down" } }, transition: { preset: "cut", durationSeconds: .4, direction: "left" } }] }, scenes: [], tracks: [], blocks: [{
      id: lineId, kind: "dialogue-line", order: 0, timeline: { startSeconds: 0, durationSeconds: 1.2, sourceStartSeconds: 0, linkGroupId: lineId, locked: false, transform: { xPercent: 45, yPercent: 65, widthPercent: 35, heightPercent: 70, rotationDegrees: 0, opacity: 1, zIndex: 3 }, motion: { entrance: { preset: "slide", durationSeconds: .25, easing: "smooth", direction: "left" }, during: { preset: "float", durationSeconds: .2, easing: "gentle", direction: "up" }, exit: { preset: "scale", durationSeconds: .2, easing: "gentle", direction: "down" } } }, data: { characterId, characterImageId: imageId, text: "A real local render.", position: "center", speechSpeed: "normal", speechClipId: speechId, gapAfterSeconds: 0.1, hideSubtitles: false },
    }] },
  };
  const character: CharacterRecord = { id: characterId, name: "Verifier", description: "", voiceId, voiceName: "Test voice", voiceProvider: "elevenlabs", createdAt: new Date().toISOString(), images: [{ id: imageId, label: "Default", width: 180, height: 250, imageUrl: "" }] };
  const speech: SpeechClipRecord = { id: speechId, voiceId, voiceName: "Test voice", provider: "elevenlabs", providerVoiceId: "test", text: "A real local render.", model: "fixture", speed: "normal", mimeType: "audio/wav", sizeBytes: 0, durationSeconds: 1.2, timingSource: "estimated", audioUrl: "", createdAt: new Date().toISOString(), words: [
    { text: "local", type: "word", startSeconds: 0.5, endSeconds: 0.8 }, { text: "render.", type: "word", startSeconds: 0.8, endSeconds: 1.2 },
  ] };
  await writeFile(join(assets, "character.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8p1AAAAAElFTkSuQmCC", "base64"));
  await writeFile(join(assets, "overlay.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8p1AAAAAElFTkSuQmCC", "base64"));
  await writeFile(join(assets, "speech.wav"), makeWav(1.2));
  await copyFile(require.resolve("gsap/dist/gsap.min.js"), join(assets, "gsap.min.js"));
  await copyFile(captionFontPath(project.editorState.captions.fontFamily), join(assets, "caption-font.woff2"));
  const composition = compileProjectToHyperframes({ project, characters: [character], speechClips: [speech], assets: {
    gsapUrl: "./assets/gsap.min.js", characterImageUrls: new Map([[imageId, "./assets/character.png"]]), speechUrls: new Map([[speechId, "./assets/speech.wav"]]), mediaUrls: new Map([["overlay-asset", "./assets/overlay.png"]]), fontUrls: new Map([[project.editorState.captions.fontFamily, "./assets/caption-font.woff2"]]),
  } });
  assert.equal(composition.renderable, true); assert.equal(composition.missingSpeechLineIds.length, 0);
  assert.match(composition.html, new RegExp(`data-hf-id="dialogue:${lineId}:character"`));
  assert.match(composition.html, new RegExp(`data-hf-id="dialogue:${lineId}:speech"`));
  assert.match(composition.html, /data-timeline-role="voiceover"/);
  assert.match(composition.html, /data-hf-id="item:overlay-item"/); assert.match(composition.html, /left:45%/);
  assert.match(composition.html, /motion-character-/); assert.match(composition.html, /motion-item-overlay-item/); assert.match(composition.html, /timeline\.fromTo/);
  assert.match(composition.html, /class="motion-subject"/); assert.doesNotMatch(composition.html, /timed-subject/); assert.match(composition.html, /timeline\.set\("#motion-character-.*autoAlpha/); assert.doesNotMatch(composition.html, /timeline\.(?:set|fromTo)\("[^"\n]*\.clip/); assert.match(composition.html, /class="caption-surface"/); assert.match(composition.html, /class="caption-word active">A<\/span>/);
  await writeFile(join(directory, "index.html"), composition.html);
  await writeFile(join(directory, "caption-overrides.json"), "[]\n");
  const cli = join(process.cwd(), "node_modules", "hyperframes", "bin", "hyperframes.mjs");
  const checked = await execFileAsync(process.execPath, [cli, "check", directory, "--json", "--at", "0,0.5,1", ...(keepArtifacts ? ["--snapshots"] : [])], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  const report = JSON.parse(checked.stdout) as { summary?: { errors?: number } };
  assert.equal(report.summary?.errors ?? 0, 0, checked.stdout);
  if (process.argv.includes("--check-only")) {
    console.log(JSON.stringify({ ok: true, checkErrors: report.summary?.errors ?? 0, stableTimelineIds: true }, null, 2));
    process.exitCode = 0;
  } else {
  const output = join(directory, "verification.mp4");
  const job = createRenderJob({ fps: 30, quality: "draft", format: "mp4", workers: 1, entryFile: "index.html", hdrMode: "force-sdr", strictness: "best-effort" });
  await executeRenderJob(job, directory, output);
  const rendered = await stat(output); assert.ok(rendered.size > 1_000, `Rendered file was only ${rendered.size} bytes.`);
  const probe = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], { timeout: 30_000 });
  const duration = Number(probe.stdout.trim()); assert.ok(duration >= 1.1 && duration <= 1.5, `Unexpected duration: ${duration}`);
  console.log(JSON.stringify({ ok: true, checkErrors: report.summary?.errors ?? 0, bytes: rendered.size, duration }, null, 2));
  }
} finally {
  if (keepArtifacts) console.log(JSON.stringify({ artifacts: directory })); else await rm(directory, { recursive: true, force: true });
}

function makeWav(durationSeconds: number): Buffer {
  const rate = 16_000; const samples = Math.ceil(rate * durationSeconds); const dataBytes = samples * 2; const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples; index++) buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * index / rate) * 1_200), 44 + index * 2);
  return buffer;
}
