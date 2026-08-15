import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-migration-"));
process.env.DIALOGUELAB_DATA_DIR = directory;
const path = join(directory, "dialoguelab.sqlite");
const legacy = new DatabaseSync(path);
legacy.exec(`
  CREATE TABLE speech_clips (id TEXT PRIMARY KEY);
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', project_type TEXT NOT NULL,
    canvas_json TEXT NOT NULL, editor_state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE render_jobs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_name TEXT NOT NULL, project_snapshot_json TEXT NOT NULL,
    status TEXT NOT NULL, stage TEXT NOT NULL, progress REAL NOT NULL, quality TEXT NOT NULL, file_name TEXT NOT NULL,
    storage_name TEXT NOT NULL UNIQUE, size_bytes INTEGER NOT NULL DEFAULT 0, duration_seconds REAL NOT NULL DEFAULT 0,
    error TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
  );
`);
legacy.close();

try {
  const { db } = await import("../src/server/database");
  const database = db();
  const columns = (table: string) => (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((item) => item.name);
  assert(columns("speech_clips").includes("timing_source"));
  assert(columns("projects").includes("revision"));
  assert(columns("projects").includes("history_cursor"));
  assert(columns("render_jobs").includes("worker_pid"));
  assert(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_history'").get());
  database.close();
  console.log(JSON.stringify({ ok: true, migratedColumns: 4, schemaTablesPresent: true }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
