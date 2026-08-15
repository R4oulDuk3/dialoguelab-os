import type { ProjectEditorState, ProjectRecord } from "@/shared/contracts";
import { normalizeProjectEditorState } from "@/shared/project-timeline";
import { db } from "./database";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  editor_state_json: string;
  revision: number;
  history_cursor: number;
  created_at: string;
  updated_at: string;
}

export const projectRepository = {
  list(): ProjectRecord[] {
    return (db().prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as unknown as ProjectRow[]).map(fromRow);
  },
  get(id: string): ProjectRecord | undefined {
    const row = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as unknown as ProjectRow | undefined;
    return row ? fromRow(row) : undefined;
  },
  create(input: ProjectRecord): ProjectRecord {
    const database = db(); const state = JSON.stringify(input.editorState);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("INSERT INTO projects(id, name, description, editor_state_json, revision, history_cursor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(input.id, input.name, input.description, state, input.revision, 0, input.createdAt, input.updatedAt);
      database.prepare(`INSERT INTO project_history(project_id, sequence, revision, source, command_kind, summary, editor_state_json, created_at)
        VALUES (?, 0, ?, 'system', 'initial', 'Initial project', ?, ?)`).run(input.id, input.revision, state, input.createdAt);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    return this.get(input.id)!;
  },
  update(input: ProjectRecord): ProjectRecord {
    db().prepare("UPDATE projects SET name = ?, description = ?, editor_state_json = ?, updated_at = ? WHERE id = ?")
      .run(input.name, input.description, JSON.stringify(input.editorState), input.updatedAt, input.id);
    return this.get(input.id)!;
  },
  remove(id: string): void { db().prepare("DELETE FROM projects WHERE id = ?").run(id); },
};

function fromRow(row: ProjectRow): ProjectRecord {
  const database = db();
  const previous = database.prepare("SELECT 1 FROM project_history WHERE project_id = ? AND sequence < ? LIMIT 1").get(row.id, row.history_cursor);
  const next = database.prepare("SELECT 1 FROM project_history WHERE project_id = ? AND sequence > ? LIMIT 1").get(row.id, row.history_cursor);
  return { id: row.id, name: row.name, description: row.description, editorState: normalizeProjectEditorState(JSON.parse(row.editor_state_json) as ProjectEditorState),
    revision: row.revision ?? 0, canUndo: Boolean(previous), canRedo: Boolean(next), createdAt: row.created_at, updatedAt: row.updated_at };
}
