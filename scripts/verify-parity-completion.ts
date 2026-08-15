import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-parity-completion-"));
process.env.DIALOGUELAB_DATA_DIR = directory;
let closeDatabase: (() => void) | undefined;

try {
  const { db } = await import("../src/server/database"); const database = db(); closeDatabase = () => database.close(); const now = new Date().toISOString();
  const firstVoiceId = crypto.randomUUID(); const secondVoiceId = crypto.randomUUID(); const backgroundId = crypto.randomUUID();
  database.prepare("INSERT INTO voices(id,provider,provider_voice_id,name,description,kind,created_at) VALUES (?,'elevenlabs','first','First voice','','existing',?)").run(firstVoiceId, now);
  database.prepare("INSERT INTO voices(id,provider,provider_voice_id,name,description,kind,created_at) VALUES (?,'elevenlabs','second','Second voice','','existing',?)").run(secondVoiceId, now);
  database.prepare("INSERT INTO backgrounds(id,name,description,file_name,storage_name,mime_type,size_bytes,width,height,duration_seconds,created_at) VALUES (?,'Fixture background','','fixture.mp4','fixture.mp4','video/mp4',1,1080,1920,30,?)").run(backgroundId, now);
  const { backgroundService, characterService, projectService, speechService, voiceService } = await import("../src/server/services");
  const character = characterService.create({ name: "Fixture character", description: "", voiceId: firstVoiceId, images: [{ name: "pose.png", mimeType: "image/png", bytes: new Uint8Array([1]), label: "Default", width: 320, height: 640 }] });
  const { speechRepository } = await import("../src/server/speech-repository"); const speechId = crypto.randomUUID();
  speechRepository.create({ id: speechId, voiceId: firstVoiceId, voiceName: "First voice", provider: "elevenlabs", providerVoiceId: "first", text: "Fixture dialogue", model: "fixture", speed: "normal", storageName: "fixture.wav", mimeType: "audio/wav", sizeBytes: 1, durationSeconds: 1, timingSource: "estimated", words: [{ text: "Fixture", type: "word", startSeconds: 0, endSeconds: .5 }, { text: "dialogue", type: "word", startSeconds: .5, endSeconds: 1 }], createdAt: now });
  const { projectCommandService } = await import("../src/server/project-command-service");
  const project = projectService.create({ name: "Parity completion", description: "", width: 1080, height: 1920, fps: 30 });
  const created = projectCommandService.apply({ localProjectId: project.id, source: "system", commands: [
    { kind: "configure-stage", backgroundId, characterIds: [character.id] },
    { kind: "add-dialogue-line", line: { characterId: character.id, characterImageId: character.images[0].id, text: "Fixture dialogue", position: "left", speechSpeed: "normal", speechClipId: speechId, gapAfterSeconds: .2, hideSubtitles: false } },
    { kind: "add-dialogue-line", line: { characterId: character.id, characterImageId: character.images[0].id, text: "Second fixture line", position: "right", speechSpeed: "normal", speechClipId: speechId, gapAfterSeconds: .2, hideSubtitles: false } },
  ] });
  const lineIds = created.timeline.segments.map((segment) => segment.blockId); const transform = { xPercent: 42, yPercent: 63, widthPercent: 38, heightPercent: 58 };
  const transformed = projectCommandService.apply({ localProjectId: project.id, source: "system", commands: lineIds.map((blockId) => ({ kind: "set-block-transform" as const, blockId, transform })) });
  assert.deepEqual(transformed.project.editorState.blocks.filter((block) => block.kind === "dialogue-line").map((block) => block.timeline?.transform && ({ xPercent: block.timeline.transform.xPercent, yPercent: block.timeline.transform.yPercent, widthPercent: block.timeline.transform.widthPercent, heightPercent: block.timeline.transform.heightPercent })), [transform, transform]);
  const animated = projectCommandService.apply({ localProjectId: project.id, source: "system", commands: [{ kind: "set-block-motion", blockId: lineIds[0], motion: { combo: { preset: "smoothGlitchIntenseZoomIn", durationSeconds: .2, easing: "snappy", direction: "up" } } }, { kind: "set-block-motion", blockId: lineIds[1], motion: { during: { preset: "handheld", durationSeconds: .35, easing: "gentle", direction: "up" } } }] });
  assert.equal(animated.project.editorState.blocks[0].timeline?.motion?.combo?.preset, "smoothGlitchIntenseZoomIn");
  assert.equal(animated.project.editorState.blocks[1].timeline?.motion?.during.preset, "handheld");
  const { compileProjectToHyperframes } = await import("../src/server/hyperframes-composition");
  const composition = compileProjectToHyperframes({ project: animated.project, characters: [character], speechClips: speechRepository.list(), background: backgroundService.list()[0], assets: { gsapUrl: "./gsap.js", backgroundUrl: "./background.mp4", characterImageUrls: new Map([[character.images[0].id, "./pose.png"]]), speechUrls: new Map([[speechId, "./speech.wav"]]) } });
  assert.equal(composition.renderable, true); assert.match(composition.html, /power1\.inOut/); assert.match(composition.html, /ease":"none"/); assert.doesNotMatch(composition.html, /Math\.random/);

  await assert.rejects(() => backgroundService.remove(backgroundId), /Choose a different background/);
  assert.throws(() => characterService.remove(character.id), /Remove this character/);
  assert.throws(() => voiceService.remove(firstVoiceId), /Reassign the voice/);
  await assert.rejects(() => speechService.remove(speechId), /Regenerate or detach/);
  assert.throws(() => characterService.update({ localCharacterId: character.id, name: character.name, description: character.description, voiceId: firstVoiceId, existingImages: [], newImages: [{ name: "replacement.png", mimeType: "image/png", bytes: new Uint8Array([2]), label: "Replacement", width: 320, height: 640 }] }), /pose is used/i);

  characterService.update({ localCharacterId: character.id, name: character.name, description: character.description, voiceId: secondVoiceId, existingImages: character.images.map((image) => ({ id: image.id, label: image.label, width: image.width, height: image.height })), newImages: [] });
  const invalidated = projectService.get(project.id);
  assert.ok(invalidated.editorState.blocks.every((block) => block.kind !== "dialogue-line" || !block.data.speechClipId), "Changing a character voice must invalidate every old line clip.");
  console.log(JSON.stringify({ ok: true, safeDeletion: true, missingAssetProtection: true, fullMotionCatalog: true, bulkCharacterTransform: true, voiceChangeInvalidation: true }, null, 2));
} finally {
  closeDatabase?.();
  await rm(directory, { recursive: true, force: true });
}
