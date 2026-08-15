import type { ProjectRecord, ProjectRenderJobRecord, ProjectRenderJobStatus, RenderQuality } from "@/shared/contracts";
import { db } from "./database";

interface RenderRow {
  id: string; project_id: string; project_name: string; project_revision: number; project_snapshot_json: string;
  status: ProjectRenderJobStatus; progress: number; stage: string; quality: RenderQuality; file_name: string;
  storage_name: string; size_bytes: number; duration_seconds: number; error: string | null; created_at: string;
  started_at: string | null; completed_at: string | null; worker_pid: number | null;
}

export interface StoredRenderJob extends ProjectRenderJobRecord { storageName: string; projectSnapshot: ProjectRecord; }

export const renderRepository = {
  list(projectId?: string): ProjectRenderJobRecord[] {
    const rows = (projectId
      ? db().prepare("SELECT * FROM render_jobs WHERE project_id = ? ORDER BY created_at DESC").all(projectId)
      : db().prepare("SELECT * FROM render_jobs ORDER BY created_at DESC").all()) as unknown as RenderRow[];
    return rows.map(fromRow);
  },
  get(id: string): StoredRenderJob | undefined {
    const row = db().prepare("SELECT * FROM render_jobs WHERE id = ?").get(id) as unknown as RenderRow | undefined;
    return row ? fromStoredRow(row) : undefined;
  },
  create(input: { id: string; project: ProjectRecord; quality: RenderQuality; fileName: string; storageName: string }): ProjectRenderJobRecord {
    const createdAt = new Date().toISOString();
    db().prepare(`INSERT INTO render_jobs(id, project_id, project_name, project_revision, project_snapshot_json, status, progress, stage, quality, file_name, storage_name, created_at)
      VALUES (?, ?, ?, ?, ?, 'queued', 0, 'Queued', ?, ?, ?, ?)`).run(input.id, input.project.id, input.project.name, input.project.revision,
      JSON.stringify(input.project), input.quality, input.fileName, input.storageName, createdAt);
    const row = db().prepare("SELECT * FROM render_jobs WHERE id = ?").get(input.id) as unknown as RenderRow; return fromRow(row);
  },
  claimNextQueued(workerPid: number): StoredRenderJob | undefined {
    const database = db(); database.exec("BEGIN IMMEDIATE");
    try {
      const row = database.prepare("SELECT id FROM render_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
      if (!row) { database.exec("COMMIT"); return undefined; }
      const result = database.prepare("UPDATE render_jobs SET status = 'preparing', progress = 1, stage = 'Preparing local assets', error = NULL, started_at = ?, worker_pid = ? WHERE id = ? AND status = 'queued'")
        .run(new Date().toISOString(), workerPid, row.id);
      database.exec("COMMIT"); return result.changes ? this.get(row.id) : undefined;
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  },
  update(id: string, patch: Partial<{ status: ProjectRenderJobStatus; progress: number; stage: string; sizeBytes: number; durationSeconds: number; error: string | null; startedAt: string | null; completedAt: string | null; workerPid: number | null }>): ProjectRenderJobRecord {
    const columns = new Map<string, unknown>([
      ["status", patch.status], ["progress", patch.progress], ["stage", patch.stage], ["size_bytes", patch.sizeBytes],
      ["duration_seconds", patch.durationSeconds], ["error", patch.error], ["started_at", patch.startedAt], ["completed_at", patch.completedAt], ["worker_pid", patch.workerPid],
    ]);
    const present = [...columns].filter(([, value]) => value !== undefined);
    if (present.length) db().prepare(`UPDATE render_jobs SET ${present.map(([name]) => `${name} = ?`).join(", ")} WHERE id = ?`).run(...present.map(([, value]) => value as string | number | null), id);
    const row = db().prepare("SELECT * FROM render_jobs WHERE id = ?").get(id) as unknown as RenderRow | undefined; if (!row) throw new Error("Render job not found."); return fromRow(row);
  },
  remove(id: string): void { db().prepare("DELETE FROM render_jobs WHERE id = ?").run(id); },
  recoverInterrupted(): void {
    const active = db().prepare("SELECT id, worker_pid FROM render_jobs WHERE status IN ('preparing','rendering')").all() as Array<{ id: string; worker_pid: number | null }>;
    for (const job of active) { let alive = false; if (job.worker_pid) try { process.kill(job.worker_pid, 0); alive = true; } catch { alive = false; }
      if (!alive) db().prepare("UPDATE render_jobs SET status = 'queued', progress = 0, stage = 'Queued after app restart', started_at = NULL, worker_pid = NULL WHERE id = ?").run(job.id); }
  },
};

function fromRow(row: RenderRow): ProjectRenderJobRecord { const { storageName: _storageName, projectSnapshot: _snapshot, ...record } = fromStoredRow(row); return record; }
function fromStoredRow(row: RenderRow): StoredRenderJob {
  return { id: row.id, projectId: row.project_id, projectName: row.project_name, projectRevision: row.project_revision,
    projectSnapshot: JSON.parse(row.project_snapshot_json) as ProjectRecord, status: row.status, progress: row.progress, stage: row.stage,
    quality: row.quality, fileName: row.file_name, storageName: row.storage_name, sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds, videoUrl: row.status === "complete" ? `/api/projects/render/video?projectId=${encodeURIComponent(row.project_id)}&renderId=${encodeURIComponent(row.id)}` : undefined,
    error: row.error ?? undefined, createdAt: row.created_at, startedAt: row.started_at ?? undefined, completedAt: row.completed_at ?? undefined };
}
