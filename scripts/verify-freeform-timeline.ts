import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-freeform-")); process.env.DIALOGUELAB_DATA_DIR = directory;
let closeDatabase: (() => void) | undefined;
try {
  const databaseModule = await import("../src/server/database"); const database = databaseModule.db(); closeDatabase = () => database.close(); const now = new Date().toISOString();
  const voiceId = crypto.randomUUID(); const characterId = crypto.randomUUID(); const imageId = crypto.randomUUID(); const speechId = crypto.randomUUID(); const secondSpeechId = crypto.randomUUID();
  database.prepare("INSERT INTO voices(id, provider, provider_voice_id, name, description, kind, created_at) VALUES (?, 'elevenlabs', 'fixture', 'Fixture voice', '', 'existing', ?)").run(voiceId, now);
  database.prepare("INSERT INTO characters(id, name, description, voice_id, created_at) VALUES (?, 'Fixture character', '', ?, ?)").run(characterId, voiceId, now);
  database.prepare(`INSERT INTO character_images(id, character_id, label, mime_type, image_data, width, height, sort_order, created_at)
    VALUES (?, ?, 'Default', 'image/png', ?, 320, 640, 0, ?)`).run(imageId, characterId, Buffer.from([0]), now);
  const { speechRepository } = await import("../src/server/speech-repository");
  speechRepository.create({ id: speechId, voiceId, voiceName: "Fixture voice", provider: "elevenlabs", providerVoiceId: "fixture", text: "one two three four",
    model: "fixture", speed: "normal", storageName: "fixture.wav", mimeType: "audio/wav", sizeBytes: 1, durationSeconds: 4, timingSource: "provider", createdAt: now,
    words: [{ text: "one", type: "word", startSeconds: 0, endSeconds: 1 }, { text: "two", type: "word", startSeconds: 1, endSeconds: 2 }, { text: "three", type: "word", startSeconds: 2, endSeconds: 3 }, { text: "four", type: "word", startSeconds: 3, endSeconds: 4 }] });
  speechRepository.create({ id: secondSpeechId, voiceId, voiceName: "Fixture voice", provider: "elevenlabs", providerVoiceId: "fixture", text: "second line",
    model: "fixture", speed: "normal", storageName: "fixture-2.wav", mimeType: "audio/wav", sizeBytes: 1, durationSeconds: 2, timingSource: "provider", createdAt: now,
    words: [{ text: "second", type: "word", startSeconds: 0, endSeconds: 1 }, { text: "line", type: "word", startSeconds: 1, endSeconds: 2 }] });
  const { projectService } = await import("../src/server/services"); const { projectCommandService } = await import("../src/server/project-command-service");
  const created = projectService.create({ name: "Free-form fixture", description: "", width: 1080, height: 1920, fps: 30 });
  const built = projectCommandService.apply({ localProjectId: created.id, expectedRevision: 0, source: "system", commands: [
    { kind: "configure-stage", characterIds: [characterId] },
    { kind: "add-dialogue-line", line: { characterId, characterImageId: imageId, text: "one two three four", speechClipId: speechId, position: "center", speechSpeed: "normal", gapAfterSeconds: .35, hideSubtitles: false } },
    { kind: "add-dialogue-line", line: { characterId, characterImageId: imageId, text: "second line", speechClipId: secondSpeechId, position: "center", speechSpeed: "normal", gapAfterSeconds: .2, hideSubtitles: false } },
  ] });
  const lineId = built.timeline.segments[0].blockId; const secondLineId = built.timeline.segments[1].blockId;
  const manual = projectCommandService.apply({ localProjectId: created.id, expectedRevision: built.revision, source: "ui", commands: [{ kind: "set-timeline-mode", mode: "manual" }] });
  assert.equal(manual.project.editorState.timeline.mode, "manual"); assert.equal(manual.timeline.segments[0].startSeconds, 0); assert.equal(manual.timeline.segments[0].durationSeconds, 4);
  const trimmed = projectCommandService.apply({ localProjectId: created.id, expectedRevision: manual.revision, source: "mcp", commands: [{ kind: "set-dialogue-timings", edits: [{ lineId, startSeconds: 1.5, durationSeconds: 2, sourceStartSeconds: 1 }] }] });
  const segment = trimmed.timeline.segments[0]; assert.equal(segment.startSeconds, 1.5); assert.equal(segment.durationSeconds, 2); assert.equal(segment.sourceStartSeconds, 1); assert.equal(trimmed.timeline.durationSeconds, 6.35);
  assert.equal(trimmed.project.editorState.tracks.find((track) => track.id === "speech")?.clips[0].metadata?.sourceStartSeconds, 1);
  const restored = projectCommandService.undo(created.id, trimmed.revision); assert.equal(restored.timeline.segments[0].startSeconds, 0); assert.equal(restored.timeline.segments[0].durationSeconds, 4);
  const reordered = projectCommandService.apply({ localProjectId: created.id, expectedRevision: restored.revision, source: "mcp", commands: [{ kind: "reorder-dialogue-lines", lineIds: [secondLineId, lineId] }] });
  assert.deepEqual(reordered.timeline.segments.map((item) => item.blockId), [secondLineId, lineId]); assert.equal(reordered.timeline.segments[0].startSeconds, 0);
  assert.equal(reordered.timeline.segments[1].startSeconds, 2.2); assert.equal(reordered.timeline.segments[1].durationSeconds, 4);
  console.log(JSON.stringify({ ok: true, schemaVersion: trimmed.project.editorState.schemaVersion, mode: trimmed.project.editorState.timeline.mode, linkedGroup: true, sourceTrim: true, manualReorderReflows: true, undo: true }, null, 2));
} finally { closeDatabase?.(); await rm(directory, { recursive: true, force: true }); }
