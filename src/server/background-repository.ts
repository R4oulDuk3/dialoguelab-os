import type { BackgroundRecord } from "@/shared/contracts";
import { db } from "./database";

interface BackgroundRow {
  id: string;
  name: string;
  description: string;
  file_name: string;
  storage_name: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  duration_seconds: number;
  created_at: string;
}

export interface StoredBackground extends BackgroundRecord { storageName: string; }

export const backgroundRepository = {
  list(): BackgroundRecord[] {
    return (db().prepare("SELECT * FROM backgrounds ORDER BY created_at DESC").all() as unknown as BackgroundRow[]).map(fromRow);
  },
  get(id: string): StoredBackground | undefined {
    const row = db().prepare("SELECT * FROM backgrounds WHERE id = ?").get(id) as unknown as BackgroundRow | undefined;
    return row ? fromStoredRow(row) : undefined;
  },
  create(input: Omit<StoredBackground, "videoUrl" | "thumbnailUrl">): BackgroundRecord {
    db().prepare(`INSERT INTO backgrounds(id, name, description, file_name, storage_name, mime_type, size_bytes, width, height, duration_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.id, input.name, input.description, input.fileName, input.storageName,
      input.mimeType, input.sizeBytes, input.width, input.height, input.durationSeconds, input.createdAt);
    return fromRow({ id: input.id, name: input.name, description: input.description, file_name: input.fileName,
      storage_name: input.storageName, mime_type: input.mimeType, size_bytes: input.sizeBytes, width: input.width,
      height: input.height, duration_seconds: input.durationSeconds, created_at: input.createdAt });
  },
  update(id: string, input: { name: string; description: string }): BackgroundRecord {
    db().prepare("UPDATE backgrounds SET name = ?, description = ? WHERE id = ?").run(input.name, input.description, id);
    const row = db().prepare("SELECT * FROM backgrounds WHERE id = ?").get(id) as unknown as BackgroundRow | undefined;
    if (!row) throw new Error("Background not found."); return fromRow(row);
  },
  remove(id: string): void { db().prepare("DELETE FROM backgrounds WHERE id = ?").run(id); },
};

function fromRow(row: BackgroundRow): BackgroundRecord {
  const { storageName: _storageName, ...record } = fromStoredRow(row);
  return record;
}

function fromStoredRow(row: BackgroundRow): StoredBackground {
  return { id: row.id, name: row.name, description: row.description, fileName: row.file_name, storageName: row.storage_name,
    mimeType: row.mime_type, sizeBytes: row.size_bytes, width: row.width, height: row.height, durationSeconds: row.duration_seconds,
    videoUrl: `/api/backgrounds/video?id=${encodeURIComponent(row.id)}`, thumbnailUrl: `/api/backgrounds/thumbnail?id=${encodeURIComponent(row.id)}`, createdAt: row.created_at };
}
