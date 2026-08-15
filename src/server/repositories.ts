import type { ImageUpload, ProviderId, VoiceRecord } from "@/shared/contracts";
import { db } from "./database";
import { decryptSecret, encryptSecret } from "./crypto-store";

interface CredentialRow { encrypted_key: string; key_hint: string; }
interface VoiceRow {
  id: string; provider: ProviderId; provider_voice_id: string; name: string; description: string;
  kind: VoiceRecord["kind"]; preview_url: string | null; provider_category: string | null;
  requires_activation: number; created_at: string; image_updated_at: string | null;
}
interface VoiceImageRow { mime_type: string; image_data: Uint8Array; }

export const credentialRepository = {
  get(provider: ProviderId): string | undefined {
    const row = db().prepare("SELECT encrypted_key FROM provider_credentials WHERE provider = ?").get(provider) as Pick<CredentialRow, "encrypted_key"> | undefined;
    return row ? decryptSecret(row.encrypted_key) : undefined;
  },
  hint(provider: ProviderId): string | undefined {
    return (db().prepare("SELECT key_hint FROM provider_credentials WHERE provider = ?").get(provider) as Pick<CredentialRow, "key_hint"> | undefined)?.key_hint;
  },
  set(provider: ProviderId, key: string): void {
    db().prepare(`INSERT INTO provider_credentials(provider, encrypted_key, key_hint, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint, updated_at = excluded.updated_at`)
      .run(provider, encryptSecret(key), `••••${key.slice(-4)}`, new Date().toISOString());
  },
  remove(provider: ProviderId): void { db().prepare("DELETE FROM provider_credentials WHERE provider = ?").run(provider); },
};

export const appMetadataRepository = {
  get(key: string): string | undefined {
    return (db().prepare("SELECT value FROM app_metadata WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  },
  set(key: string, value: string): void {
    db().prepare(`INSERT INTO app_metadata(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  },
};

export const voiceRepository = {
  list(): VoiceRecord[] {
    return (db().prepare(`SELECT voices.*, voice_images.updated_at AS image_updated_at
      FROM voices LEFT JOIN voice_images ON voice_images.voice_id = voices.id ORDER BY voices.created_at DESC`).all() as unknown as VoiceRow[]).map(fromRow);
  },
  get(id: string): VoiceRecord | undefined {
    const row = db().prepare(`SELECT voices.*, voice_images.updated_at AS image_updated_at
      FROM voices LEFT JOIN voice_images ON voice_images.voice_id = voices.id WHERE voices.id = ?`).get(id) as unknown as VoiceRow | undefined;
    return row ? fromRow(row) : undefined;
  },
  add(voice: VoiceRecord): VoiceRecord {
    db().prepare(`INSERT INTO voices(id, provider, provider_voice_id, name, description, kind, preview_url, provider_category, requires_activation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_voice_id) DO UPDATE SET name = excluded.name, description = excluded.description,
      preview_url = COALESCE(excluded.preview_url, voices.preview_url), provider_category = excluded.provider_category`)
      .run(voice.id, voice.provider, voice.providerVoiceId, voice.name, voice.description, voice.kind, voice.previewUrl ?? null, voice.providerCategory ?? null, voice.requiresActivation ? 1 : 0, voice.createdAt);
    return voice;
  },
  updateName(id: string, name: string): void { db().prepare("UPDATE voices SET name = ? WHERE id = ?").run(name, id); },
  setImage(id: string, image: ImageUpload): void {
    db().prepare(`INSERT INTO voice_images(voice_id, mime_type, image_data, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(voice_id) DO UPDATE SET mime_type = excluded.mime_type, image_data = excluded.image_data, updated_at = excluded.updated_at`)
      .run(id, image.mimeType, Buffer.from(image.bytes), new Date().toISOString());
  },
  image(id: string): VoiceImageRow | undefined {
    return db().prepare("SELECT mime_type, image_data FROM voice_images WHERE voice_id = ?").get(id) as unknown as VoiceImageRow | undefined;
  },
  remove(id: string): void { db().prepare("DELETE FROM voices WHERE id = ?").run(id); },
};

function fromRow(row: VoiceRow): VoiceRecord {
  return { id: row.id, provider: row.provider, providerVoiceId: row.provider_voice_id, name: row.name,
    description: row.description, kind: row.kind, previewUrl: row.preview_url ?? undefined,
    imageUrl: row.image_updated_at ? `/api/voices/image?id=${encodeURIComponent(row.id)}&v=${encodeURIComponent(row.image_updated_at)}` : undefined,
    providerCategory: row.provider_category ?? undefined, requiresActivation: Boolean(row.requires_activation), createdAt: row.created_at };
}
