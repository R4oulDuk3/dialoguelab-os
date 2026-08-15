import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDirectory } from "./data-directory";

export { dataDirectory };
export const databasePath = join(dataDirectory, "dialoguelab.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const schemaVersion = 14;
const globalDatabase = globalThis as typeof globalThis & { __dialogueDb?: DatabaseSync; __dialogueDbSchemaVersion?: number };

export function db(): DatabaseSync {
  if (globalDatabase.__dialogueDb && globalDatabase.__dialogueDbSchemaVersion === schemaVersion) return globalDatabase.__dialogueDb;
  const database = globalDatabase.__dialogueDb ?? new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS provider_credentials (
      provider TEXT PRIMARY KEY,
      encrypted_key TEXT NOT NULL,
      key_hint TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voices (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_voice_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      preview_url TEXT,
      provider_category TEXT,
      requires_activation INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_voice_id)
    );
    CREATE TABLE IF NOT EXISTS voice_images (
      voice_id TEXT PRIMARY KEY REFERENCES voices(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      image_data BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      voice_id TEXT NOT NULL REFERENCES voices(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS character_images (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      image_data BLOB NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS backgrounds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      duration_seconds REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fonts (
      id TEXT PRIMARY KEY,
      family TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      font_format TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS speech_clips (
      id TEXT PRIMARY KEY,
      voice_id TEXT REFERENCES voices(id) ON DELETE SET NULL,
      voice_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_voice_id TEXT NOT NULL,
      transcript TEXT NOT NULL,
      model TEXT NOT NULL,
      speed TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      duration_seconds REAL NOT NULL,
      words_json TEXT NOT NULL,
      timing_source TEXT NOT NULL DEFAULT 'estimated',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      duration_seconds REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at DESC);
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      editor_state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      history_cursor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
    CREATE TABLE IF NOT EXISTS project_history (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('ui', 'mcp', 'system')),
      command_kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      editor_state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      project_name TEXT NOT NULL,
      project_revision INTEGER NOT NULL,
      project_snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued','preparing','rendering','complete','failed','cancelled')),
      progress REAL NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'Queued',
      quality TEXT NOT NULL CHECK (quality IN ('draft','standard','high')),
      file_name TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      duration_seconds REAL NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
      ,worker_pid INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_render_jobs_project_created ON render_jobs(project_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  database.exec("DROP TABLE IF EXISTS voice_references");
  const speechColumns = database.prepare("PRAGMA table_info(speech_clips)").all() as Array<{ name: string }>;
  if (!speechColumns.some((column) => column.name === "timing_source"))
    database.exec("ALTER TABLE speech_clips ADD COLUMN timing_source TEXT NOT NULL DEFAULT 'estimated'");
  const projectColumns = database.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  if (!projectColumns.some((column) => column.name === "revision")) database.exec("ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 0");
  if (!projectColumns.some((column) => column.name === "history_cursor")) database.exec("ALTER TABLE projects ADD COLUMN history_cursor INTEGER NOT NULL DEFAULT 0");
  const renderColumns = database.prepare("PRAGMA table_info(render_jobs)").all() as Array<{ name: string }>;
  if (!renderColumns.some((column) => column.name === "worker_pid")) database.exec("ALTER TABLE render_jobs ADD COLUMN worker_pid INTEGER");
  database.exec(`INSERT OR IGNORE INTO project_history(project_id, sequence, revision, source, command_kind, summary, editor_state_json, created_at)
    SELECT id, 0, revision, 'system', 'initial', 'Initial project', editor_state_json, created_at FROM projects`);
  database.exec("PRAGMA optimize");
  globalDatabase.__dialogueDb = database;
  globalDatabase.__dialogueDbSchemaVersion = schemaVersion;
  return database;
}
