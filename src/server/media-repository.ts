import type { ProjectMediaAssetRecord } from "@/shared/contracts";
import { db } from "./database";

interface MediaRow { id: string; name: string; file_name: string; storage_name: string; kind: ProjectMediaAssetRecord["kind"]; mime_type: string; size_bytes: number; width: number; height: number; duration_seconds: number; created_at: string }
export interface StoredMediaAsset extends ProjectMediaAssetRecord { storageName: string }

export const mediaRepository = {
  list(): ProjectMediaAssetRecord[] { return (db().prepare("SELECT * FROM media_assets ORDER BY created_at DESC").all() as unknown as MediaRow[]).map(fromRow); },
  get(id: string): StoredMediaAsset | undefined { const row = db().prepare("SELECT * FROM media_assets WHERE id = ?").get(id) as unknown as MediaRow | undefined; return row ? fromStored(row) : undefined; },
  create(input: Omit<StoredMediaAsset, "mediaUrl">): ProjectMediaAssetRecord {
    db().prepare(`INSERT INTO media_assets(id,name,file_name,storage_name,kind,mime_type,size_bytes,width,height,duration_seconds,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(input.id, input.name, input.fileName, input.storageName, input.kind, input.mimeType, input.sizeBytes, input.width, input.height, input.durationSeconds, input.createdAt);
    return fromRow({ id: input.id, name: input.name, file_name: input.fileName, storage_name: input.storageName, kind: input.kind, mime_type: input.mimeType,
      size_bytes: input.sizeBytes, width: input.width, height: input.height, duration_seconds: input.durationSeconds, created_at: input.createdAt });
  },
  remove(id: string) { db().prepare("DELETE FROM media_assets WHERE id = ?").run(id); },
};
function fromRow(row: MediaRow): ProjectMediaAssetRecord { const { storageName: _storageName, ...record } = fromStored(row); return record; }
function fromStored(row: MediaRow): StoredMediaAsset { return { id: row.id, name: row.name, fileName: row.file_name, storageName: row.storage_name, kind: row.kind,
  mimeType: row.mime_type, sizeBytes: row.size_bytes, width: row.width, height: row.height, durationSeconds: row.duration_seconds,
  mediaUrl: `/api/media/file?id=${encodeURIComponent(row.id)}`, createdAt: row.created_at }; }
