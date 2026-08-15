import type { ProviderId, SpeechClipRecord, SpeechTimingSource, SpeechWord, TextToSpeechSpeed } from "@/shared/contracts";
import { db } from "./database";

interface SpeechRow {
  id: string; voice_id: string | null; voice_name: string; provider: ProviderId; provider_voice_id: string; transcript: string;
  model: string; speed: TextToSpeechSpeed; storage_name: string; mime_type: string; size_bytes: number; duration_seconds: number; words_json: string; timing_source: SpeechTimingSource; created_at: string;
}
export interface StoredSpeechClip extends SpeechClipRecord { storageName: string; }

export const speechRepository = {
  list(voiceId?: string): SpeechClipRecord[] {
    const rows = (voiceId ? db().prepare("SELECT * FROM speech_clips WHERE voice_id = ? ORDER BY created_at DESC").all(voiceId)
      : db().prepare("SELECT * FROM speech_clips ORDER BY created_at DESC").all()) as unknown as SpeechRow[];
    return rows.map(fromRow);
  },
  get(id: string): StoredSpeechClip | undefined {
    const row = db().prepare("SELECT * FROM speech_clips WHERE id = ?").get(id) as unknown as SpeechRow | undefined;
    return row ? fromStoredRow(row) : undefined;
  },
  create(input: Omit<StoredSpeechClip, "audioUrl">): SpeechClipRecord {
    db().prepare(`INSERT INTO speech_clips(id, voice_id, voice_name, provider, provider_voice_id, transcript, model, speed, storage_name, mime_type, size_bytes, duration_seconds, words_json, timing_source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.id, input.voiceId ?? null, input.voiceName, input.provider, input.providerVoiceId,
      input.text, input.model, input.speed, input.storageName, input.mimeType, input.sizeBytes, input.durationSeconds, JSON.stringify(input.words), input.timingSource, input.createdAt);
    const { storageName: _storageName, ...record } = input;
    return { ...record, audioUrl: `/api/speech/audio?id=${encodeURIComponent(input.id)}` };
  },
  remove(id: string): void { db().prepare("DELETE FROM speech_clips WHERE id = ?").run(id); },
};

function fromRow(row: SpeechRow): SpeechClipRecord { const { storageName: _storageName, ...record } = fromStoredRow(row); return record; }
function fromStoredRow(row: SpeechRow): StoredSpeechClip {
  let words: SpeechWord[] = []; try { words = JSON.parse(row.words_json) as SpeechWord[]; } catch { /* keep empty */ }
  return { id: row.id, voiceId: row.voice_id ?? undefined, voiceName: row.voice_name, provider: row.provider, providerVoiceId: row.provider_voice_id,
    text: row.transcript, model: row.model, speed: row.speed, storageName: row.storage_name, mimeType: row.mime_type, sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds, words, timingSource: row.timing_source || "estimated", audioUrl: `/api/speech/audio?id=${encodeURIComponent(row.id)}`, createdAt: row.created_at };
}
