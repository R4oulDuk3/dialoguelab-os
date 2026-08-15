import type { CloneVoiceInput, DesignPreview, DesignVoiceInput, ElevenLabsSpeechToTextModel, RemoteVoice, SaveDesignInput, SpeechWord, VoiceRecord } from "@/shared/contracts";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { checkedFetch, requireApiKey, voiceRecord, type GeneratedSpeech, type SynthesisInput, type VoiceProvider } from "./provider";

const API = "https://api.elevenlabs.io";
interface ElevenVoice { voice_id: string; name: string; description?: string | null; preview_url?: string | null; category?: string; labels?: Record<string, string>; }

export class ElevenLabsProvider implements VoiceProvider {
  readonly id = "elevenlabs" as const;
  async validateKey(value?: string) { const apiKey = requireApiKey(value, "ElevenLabs"); await checkedFetch(`${API}/v2/voices?page_size=1&include_total_count=false`, { headers: this.headers(apiKey) }); }
  async listVoices(value?: string): Promise<RemoteVoice[]> {
    const apiKey = requireApiKey(value, "ElevenLabs");
    const response = await checkedFetch(`${API}/v2/voices?page_size=100&include_total_count=false&sort=name&sort_direction=asc`, { headers: this.headers(apiKey) });
    const data = await response.json() as { voices: ElevenVoice[] };
    return data.voices.map((voice) => ({ provider: this.id, providerVoiceId: voice.voice_id, name: voice.name,
      description: voice.description || Object.values(voice.labels ?? {}).join(" · ") || "ElevenLabs voice",
      previewUrl: voice.preview_url ?? undefined, category: voice.category }));
  }
  async clone(value: string | undefined, input: CloneVoiceInput): Promise<VoiceRecord> {
    const apiKey = requireApiKey(value, "ElevenLabs");
    const form = new FormData();
    form.append("name", input.name); form.append("description", input.description);
    form.append("remove_background_noise", String(input.removeBackgroundNoise));
    form.append("files", new Blob([input.audio.bytes as BlobPart], { type: input.audio.mimeType }), input.audio.name);
    const response = await checkedFetch(`${API}/v1/voices/add`, { method: "POST", headers: { "xi-api-key": apiKey }, body: form });
    const result = await response.json() as { voice_id: string; requires_verification?: boolean };
    return voiceRecord(this.id, result.voice_id, input.name, input.description, "cloned", undefined,
      { providerCategory: result.requires_verification ? "verification required" : "cloned" });
  }
  async design(value: string | undefined, input: DesignVoiceInput): Promise<DesignPreview[]> {
    const apiKey = requireApiKey(value, "ElevenLabs");
    const response = await checkedFetch(`${API}/v1/text-to-voice/design`, { method: "POST", headers: this.headers(apiKey),
      body: JSON.stringify({ voice_description: input.prompt, text: input.previewText, auto_generate_text: false }) });
    const data = await response.json() as { previews: Array<{ generated_voice_id: string; audio_base_64: string; media_type?: string }> };
    return data.previews.map((preview) => ({ id: crypto.randomUUID(), provider: this.id, generatedVoiceId: preview.generated_voice_id,
      audioUrl: `data:${preview.media_type || "audio/mpeg"};base64,${preview.audio_base_64}` }));
  }
  async saveDesign(value: string | undefined, input: SaveDesignInput): Promise<VoiceRecord> {
    const apiKey = requireApiKey(value, "ElevenLabs");
    const response = await checkedFetch(`${API}/v1/text-to-voice`, { method: "POST", headers: this.headers(apiKey),
      body: JSON.stringify({ voice_name: input.name, voice_description: input.description, generated_voice_id: input.preview.generatedVoiceId }) });
    const voice = await response.json() as ElevenVoice;
    return voiceRecord(this.id, voice.voice_id, voice.name || input.name, voice.description || input.description, "generated", voice.preview_url ?? input.preview.audioUrl, { providerCategory: voice.category || "generated" });
  }
  async synthesize(value: string | undefined, input: SynthesisInput): Promise<GeneratedSpeech> {
    const apiKey = requireApiKey(value, "ElevenLabs"); const model = "eleven_multilingual_v2";
    const response = await checkedFetch(`${API}/v1/text-to-speech/${encodeURIComponent(input.voice.providerVoiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST", headers: this.headers(apiKey), body: JSON.stringify({ text: input.text, model_id: model,
        language_code: input.language || undefined, voice_settings: { speed: elevenSpeed(input.speed) } }),
    });
    const data = await response.json() as { audio_base64?: string; normalized_alignment?: Alignment | null; alignment?: Alignment | null };
    if (!data.audio_base64) throw new Error("ElevenLabs did not return generated audio.");
    return { bytes: new Uint8Array(Buffer.from(data.audio_base64, "base64")), mimeType: "audio/mpeg", extension: ".mp3", model,
      words: wordsFromAlignment(data.normalized_alignment || data.alignment) };
  }
  private headers(apiKey: string) { return { "xi-api-key": apiKey, "content-type": "application/json" }; }
}

export async function elevenLabsWords(audioPath: string, apiKey: string, model: ElevenLabsSpeechToTextModel, language?: string): Promise<SpeechWord[]> {
  const bytes = new Uint8Array(await readFile(audioPath));
  const form = new FormData();
  form.append("file", new Blob([bytes]), basename(audioPath));
  form.append("model_id", model);
  if (language && /^[a-z]{2,3}$/i.test(language)) form.append("language_code", language.toLowerCase());
  const response = await fetch(`${API}/v1/speech-to-text`, {
    method: "POST", headers: { "xi-api-key": apiKey }, body: form, signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: unknown; message?: string };
    throw new Error(typeof body.detail === "string" ? body.detail : body.message || `ElevenLabs transcription failed (${response.status}).`);
  }
  const data = await response.json() as { words?: Array<{ text?: string; type?: string; start?: number; end?: number }> };
  return (data.words ?? []).filter((word) => word.text && word.type === "word" && Number.isFinite(word.start) && Number.isFinite(word.end))
    .map((word) => ({ text: word.text!, type: "word", startSeconds: word.start!, endSeconds: word.end! }));
}

interface Alignment { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]; }
function elevenSpeed(speed: SynthesisInput["speed"]): number { return speed === "slow" ? 0.8 : speed === "fast" ? 1.2 : 1; }
function wordsFromAlignment(alignment?: Alignment | null): GeneratedSpeech["words"] {
  if (!alignment?.characters?.length) return [];
  const words: GeneratedSpeech["words"] = []; let text = ""; let start = 0; let end = 0;
  const flush = () => { if (text) words.push({ text, type: "word", startSeconds: start, endSeconds: end }); text = ""; };
  alignment.characters.forEach((character, index) => {
    if (/\s/.test(character)) { flush(); return; }
    if (!text) start = alignment.character_start_times_seconds[index] ?? end;
    text += character; end = alignment.character_end_times_seconds[index] ?? start;
  });
  flush(); return words;
}
