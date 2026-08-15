import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-history-")); process.env.DIALOGUELAB_DATA_DIR = directory;
let closeDatabase: (() => void) | undefined;
try {
  const databaseModule = await import("../src/server/database"); const database = databaseModule.db(); closeDatabase = () => database.close(); const now = new Date().toISOString();
  const voiceId = crypto.randomUUID(); const characterId = crypto.randomUUID(); const imageId = crypto.randomUUID();
  database.prepare("INSERT INTO voices(id, provider, provider_voice_id, name, description, kind, created_at) VALUES (?, 'elevenlabs', 'fixture', 'Fixture voice', '', 'existing', ?)").run(voiceId, now);
  database.prepare("INSERT INTO characters(id, name, description, voice_id, created_at) VALUES (?, 'Fixture character', '', ?, ?)").run(characterId, voiceId, now);
  database.prepare(`INSERT INTO character_images(id, character_id, label, mime_type, image_data, width, height, sort_order, created_at)
    VALUES (?, ?, 'Default', 'image/png', ?, 320, 640, 0, ?)`).run(imageId, characterId, Buffer.from([0]), now);
  const { projectService } = await import("../src/server/services"); const { projectCommandService, ProjectRevisionConflict } = await import("../src/server/project-command-service");
  const created = projectService.create({ name: "History fixture", description: "", width: 1080, height: 1920, fps: 30 });
  const edited = projectCommandService.apply({ localProjectId: created.id, expectedRevision: 0, source: "mcp", summary: "Build fixture", commands: [
    { kind: "configure-stage", characterIds: [characterId] },
    { kind: "add-dialogue-line", line: { characterId, characterImageId: imageId, text: "A reversible line", position: "center", speechSpeed: "fast", gapAfterSeconds: .35, hideSubtitles: false } },
    { kind: "set-caption-style", patch: { activeWordColor: "#A78BFA" } },
  ] });
  assert.equal(edited.revision, 1); assert.equal(edited.project.editorState.blocks.length, 1); assert.equal(edited.project.editorState.captions.activeWordColor, "#A78BFA"); assert.equal(projectCommandService.history(created.id).length, 2);
  const undone = projectCommandService.undo(created.id, 1); assert.equal(undone.project.editorState.blocks.length, 0); assert.equal(undone.canRedo, true);
  const redone = projectCommandService.redo(created.id, undone.revision); assert.equal(redone.project.editorState.blocks.length, 1); assert.equal(redone.project.editorState.captions.activeWordColor, "#A78BFA");
  assert.throws(() => projectCommandService.apply({ localProjectId: created.id, expectedRevision: 0, source: "ui", commands: [{ kind: "set-caption-style", patch: { wordsPerPage: 3 } }] }), ProjectRevisionConflict);
  console.log(JSON.stringify({ ok: true, projectId: created.id, revision: redone.revision, historyEntries: projectCommandService.history(created.id).length, undoRedo: true, conflictProtection: true }, null, 2));
} finally { closeDatabase?.(); await rm(directory, { recursive: true, force: true }); }
