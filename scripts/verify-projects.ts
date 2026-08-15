import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-projects-"));
process.env.DIALOGUELAB_DATA_DIR = directory;
let closeDatabase: (() => void) | undefined;
try {
  const database = await import("../src/server/database"); const projectDb = database.db(); closeDatabase = () => projectDb.close();
  const { projectService } = await import("../src/server/services");
  const { backgroundRepository } = await import("../src/server/background-repository");
  const { PROJECT_STATE_VERSION } = await import("../src/shared/project-timeline");
  const backgroundIds = [crypto.randomUUID(), crypto.randomUUID()]; const now = new Date().toISOString();
  for (const [index, id] of backgroundIds.entries()) backgroundRepository.create({ id, name: `Background ${index + 1}`, description: "", fileName: `background-${index + 1}.mp4`, storageName: `background-${index + 1}.mp4`, mimeType: "video/mp4", sizeBytes: 1, width: 1080, height: 1920, durationSeconds: 10, createdAt: now });
  const created = projectService.create({ name: "Format-neutral test", description: "Shared editor state", width: 1080, height: 1920, fps: 30 });
  if (!created.editorState.assets.backgroundId || !backgroundIds.includes(created.editorState.assets.backgroundId)) throw new Error("Dialogue projects must preselect a random library background.");
  const updated = projectService.update({ localProjectId: created.id, editorState: { ...created.editorState,
    scenes: [{ id: "scene-1", durationSeconds: 4 }], tracks: [{ id: "dialogue", name: "Dialogue", kind: "audio", clips: [] }] } });
  if (projectService.list().length !== 1 || updated.editorState.scenes.length !== 1 || updated.editorState.tracks.length !== 5 || updated.name !== created.name || updated.revision !== 1 || updated.editorState.schemaVersion !== PROJECT_STATE_VERSION)
    throw new Error("Project persistence verification failed.");
  const plan = projectDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM projects ORDER BY updated_at DESC").all() as Array<{ detail: string }>;
  if (!plan.some((row) => row.detail.includes("idx_projects_updated_at"))) throw new Error("The project list query is not using its updated-at index.");
  projectService.remove(created.id);
  if (projectService.list().length) throw new Error("Project removal verification failed.");
  console.log(JSON.stringify({ created: created.id, schemaVersion: created.editorState.schemaVersion, revision: updated.revision, captionPreset: updated.editorState.captions.presetId, canvas: created.editorState.canvas, updatedSceneCount: updated.editorState.scenes.length, indexedProjectList: true }, null, 2));
} finally { closeDatabase?.(); await rm(directory, { recursive: true, force: true }); }
