import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-p0-")); process.env.DIALOGUELAB_DATA_DIR = directory; let closeDatabase: (() => void) | undefined;
try {
  const { PROJECT_STATE_VERSION } = await import("../src/shared/project-timeline");
  const databaseModule = await import("../src/server/database"); const database = databaseModule.db(); closeDatabase = () => database.close(); const now = new Date().toISOString();
  const voiceId = crypto.randomUUID(); const characterId = crypto.randomUUID(); const imageId = crypto.randomUUID(); const reactionImageId = crypto.randomUUID(); const speechId = crypto.randomUUID();
  database.prepare("INSERT INTO voices(id,provider,provider_voice_id,name,description,kind,created_at) VALUES (?,'elevenlabs','fixture','Fixture voice','','existing',?)").run(voiceId, now);
  database.prepare("INSERT INTO characters(id,name,description,voice_id,created_at) VALUES (?,'Fixture character','',?,?)").run(characterId, voiceId, now);
  database.prepare("INSERT INTO character_images(id,character_id,label,mime_type,image_data,width,height,sort_order,created_at) VALUES (?,?,'Default','image/png',?,320,640,0,?)").run(imageId, characterId, Buffer.from([0]), now);
  database.prepare("INSERT INTO character_images(id,character_id,label,mime_type,image_data,width,height,sort_order,created_at) VALUES (?,?,'Reaction','image/png',?,320,640,1,?)").run(reactionImageId, characterId, Buffer.from([0]), now);
  const { speechRepository } = await import("../src/server/speech-repository"); speechRepository.create({ id: speechId, voiceId, voiceName: "Fixture voice", provider: "elevenlabs", providerVoiceId: "fixture", text: "one two three four", model: "fixture", speed: "normal", storageName: "fixture.wav", mimeType: "audio/wav", sizeBytes: 1, durationSeconds: 4, timingSource: "provider", createdAt: now, words: [
    { text: "one", type: "word", startSeconds: 0, endSeconds: .7 }, { text: "two", type: "word", startSeconds: 1, endSeconds: 1.7 }, { text: "three", type: "word", startSeconds: 2, endSeconds: 2.7 }, { text: "four", type: "word", startSeconds: 3, endSeconds: 3.7 },
  ] });
  const { mediaService, projectService } = await import("../src/server/services"); const { projectCommandService } = await import("../src/server/project-command-service");
  const media = await mediaService.create({ name: "Overlay", file: { name: "overlay.png", mimeType: "image/png", bytes: new Uint8Array([1]) }, width: 640, height: 360, durationSeconds: 0 });
  const audioMedia = await mediaService.create({ name: "Music", file: { name: "music.wav", mimeType: "audio/wav", bytes: new Uint8Array([1]) }, width: 0, height: 0, durationSeconds: 10 });
  const created = projectService.create({ name: "P0 fixture", description: "", width: 1080, height: 1920, fps: 30 });
  const built = projectCommandService.apply({ localProjectId: created.id, expectedRevision: 0, source: "system", commands: [{ kind: "configure-stage", characterIds: [characterId] }, { kind: "add-dialogue-line", line: { characterId, characterImageId: imageId, text: "one two three four", speechClipId: speechId, position: "center", speechSpeed: "normal", gapAfterSeconds: .2, hideSubtitles: false } }, { kind: "add-project-track", name: "Stickers", trackKind: "visual" }] });
  const lineId = built.timeline.segments[0].blockId; const customTrack = built.project.editorState.timeline.tracks.find((track) => track.name === "Stickers")!;
  const edited = projectCommandService.apply({ localProjectId: created.id, expectedRevision: built.revision, source: "ui", commands: [
    { kind: "add-timeline-item", item: { kind: "image", assetId: media.id, trackId: customTrack.id, startSeconds: .5, durationSeconds: 2 } },
    { kind: "set-timeline-mode", mode: "manual" },
    { kind: "set-dialogue-timings", edits: [{ lineId, startSeconds: 1, durationSeconds: 3 }] },
    { kind: "set-dialogue-performance-cues", lineId, cues: [{ id: crypto.randomUUID(), characterImageId: reactionImageId, at: { wordIndex: 1, exact: "two", occurrence: 1, prefix: "one", suffix: "three four" } }] },
    { kind: "set-block-transform", blockId: lineId, transform: { xPercent: 30, yPercent: 65, widthPercent: 35, heightPercent: 55 } },
  ] });
  assert.equal(edited.project.editorState.schemaVersion, PROJECT_STATE_VERSION); assert.equal(edited.project.editorState.timeline.mode, "manual"); assert.equal(edited.project.editorState.timeline.items.length, 1);
  const segment = edited.timeline.segments[0]; assert.equal(segment.roles.character.linked, true); assert.equal(segment.roles.speech.linked, true); assert.equal(segment.roles.captions.linked, true); assert.equal(segment.durationSeconds, 3); assert.equal(segment.transform?.xPercent, 30);
  assert.equal(edited.timeline.tracks.find((track) => track.id === customTrack.id)?.clips[0].kind, "image");
  const { compileProjectToHyperframes } = await import("../src/server/hyperframes-composition"); const composition = compileProjectToHyperframes({ project: edited.project,
    characters: [{ id: characterId, name: "Fixture character", description: "", voiceId, voiceName: "Fixture voice", voiceProvider: "elevenlabs", createdAt: now, images: [{ id: imageId, label: "Default", width: 320, height: 640, imageUrl: "" }, { id: reactionImageId, label: "Reaction", width: 320, height: 640, imageUrl: "" }] }], speechClips: speechRepository.list(),
    assets: { gsapUrl: "./gsap.js", characterImageUrls: new Map([[imageId, "./character.png"], [reactionImageId, "./reaction.png"]]), speechUrls: new Map([[speechId, "./speech.wav"]]), mediaUrls: new Map([[media.id, "./overlay.png"]]) } });
  assert.match(composition.html, new RegExp(`data-hf-id="item:${edited.project.editorState.timeline.items[0].id}"`)); assert.match(composition.html, /left:30%/); assert.match(composition.html, /reaction\.png/); assert.match(composition.html, /dialogue-performance-pose/); assert.equal(composition.renderable, true);
  assert.match(composition.html, /\.motion-subject\{[^}]*visibility:hidden/); assert.match(composition.html, /autoAlpha: 1 \}, 0\.5/); assert.match(composition.html, /autoAlpha: 0 \}, 2\.5/);
  const previewSource = await readFile(join(process.cwd(), "src", "components", "HyperframesPreview.tsx"), "utf8");
  assert.doesNotMatch(previewSource, /syncPreviewVideos|pausePreviewVideos/); assert.match(previewSource, /preparePreviewMedia/); assert.match(previewSource, /UI_UPDATE_INTERVAL_MS/); assert.match(previewSource, /syncPreviewVideoLifecycle/);
  assert.match(previewSource, /previewCompositionReloadKey/); assert.match(previewSource, /applyPreviewTransform\(playerElement\.current/); assert.doesNotMatch(previewSource, /\[project\.id, project\.revision,/);
  const timeUpdateBlock = previewSource.slice(previewSource.indexOf('listen("timeupdate"'), previewSource.indexOf('listen("play"')); assert.doesNotMatch(timeUpdateBlock, /syncPreviewVideoLifecycle/);
  const workspaceSource = await readFile(join(process.cwd(), "src", "components", "ProjectWorkspace.tsx"), "utf8"); assert.match(workspaceSource, /if \(assetsLoading\) return <ProjectWorkspaceLoading/); assert.match(workspaceSource, /finally\(\(\) => \{ if \(!cancelled\) setAssetsLoading\(false\)/);
  const compositionSource = await readFile(join(process.cwd(), "src", "server", "hyperframes-composition.ts"), "utf8"); assert.match(compositionSource, /<video[^\n]+preload=\"auto\"/);
  const audioTrack = edited.project.editorState.timeline.tracks.find((track) => track.id === "audio")!;
  const withAudio = projectCommandService.apply({ localProjectId: created.id, expectedRevision: edited.revision, source: "mcp", commands: [
    { kind: "add-timeline-item", item: { kind: "audio", assetId: audioMedia.id, trackId: audioTrack.id, startSeconds: 0, durationSeconds: 2 } },
    { kind: "add-timeline-item", item: { kind: "audio", assetId: audioMedia.id, trackId: audioTrack.id, startSeconds: 1, durationSeconds: 2 } },
    { kind: "add-timeline-item", item: { kind: "audio", assetId: audioMedia.id, trackId: audioTrack.id, startSeconds: 2, durationSeconds: 1 } },
  ] });
  const authoredAudio = withAudio.project.editorState.timeline.items.filter((item) => item.kind === "audio");
  assert.equal(authoredAudio[0].trackId, audioTrack.id); assert.notEqual(authoredAudio[1].trackId, audioTrack.id); assert.equal(authoredAudio[2].trackId, audioTrack.id);
  const movedAudio = projectCommandService.apply({ localProjectId: created.id, expectedRevision: withAudio.revision, source: "ui", commands: [
    { kind: "update-timeline-items", edits: [{ itemId: authoredAudio[2].id, patch: { startSeconds: 1.5 } }] },
  ] });
  const movedItem = movedAudio.project.editorState.timeline.items.find((item) => item.id === authoredAudio[2].id)!;
  assert.notEqual(movedItem.trackId, authoredAudio[0].trackId); assert.notEqual(movedItem.trackId, authoredAudio[1].trackId);
  assert.equal(movedAudio.validationIssues.some((issue) => issue.code === "OVERLAPPING_AUDIO_ITEMS"), false);
  await assert.rejects(() => mediaService.remove(media.id), /Remove this asset/);
  const removed = projectCommandService.apply({ localProjectId: created.id, expectedRevision: movedAudio.revision, source: "mcp", commands: [{ kind: "remove-timeline-items", itemIds: [edited.project.editorState.timeline.items[0].id] }] });
  assert.equal(removed.project.editorState.timeline.items.some((item) => item.kind === "image"), false); assert.equal(removed.timeline.segments[0].roles.character.linked, true); await mediaService.remove(media.id);
  console.log(JSON.stringify({ ok: true, schemaVersion: edited.project.editorState.schemaVersion, authoredTracks: movedAudio.project.editorState.timeline.tracks.length, genericMedia: true, audioLaneAllocation: true, compoundDialogue: true, wordAnchoredPerformance: true, canvasTransform: true, renderParity: true, transactionalBatch: true }, null, 2));
} finally { closeDatabase?.(); await rm(directory, { recursive: true, force: true }); }
