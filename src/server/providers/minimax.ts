import type { CloneVoiceInput, DesignPreview, DesignVoiceInput, RemoteVoice, SaveDesignInput, VoiceRecord } from "@/shared/contracts";
import { checkedFetch, ProviderError, requireApiKey, voiceRecord, type GeneratedSpeech, type SynthesisInput, type VoiceProvider } from "./provider";

const API = "https://api.minimax.io";
interface MiniMaxVoice { voice_id: string; voice_name?: string; description?: string[]; }
interface MiniMaxResponse { base_resp?: { status_code: number; status_msg: string }; }

export class MiniMaxProvider implements VoiceProvider {
  readonly id = "minimax" as const;
  async validateKey(value?: string) { await this.getVoices(requireApiKey(value, "MiniMax"), "system"); }
  async listVoices(value?: string): Promise<RemoteVoice[]> {
    const apiKey = requireApiKey(value, "MiniMax");
    const data = await this.getVoices(apiKey, "all");
    const groups: Array<[string, MiniMaxVoice[] | undefined]> = [["system", data.system_voice], ["cloned", data.voice_cloning], ["generated", data.voice_generation]];
    return groups.flatMap(([category, voices]) => (voices ?? []).map((voice) => ({ provider: this.id,
      providerVoiceId: voice.voice_id, name: voice.voice_name || this.readableName(voice.voice_id),
      description: voice.description?.join(" ") || `MiniMax ${category} voice`, category })));
  }
  async clone(value: string | undefined, input: CloneVoiceInput): Promise<VoiceRecord> {
    const apiKey = requireApiKey(value, "MiniMax");
    const form = new FormData(); form.append("purpose", "voice_clone");
    form.append("file", new Blob([input.audio.bytes as BlobPart], { type: input.audio.mimeType }), input.audio.name);
    const uploaded = await checkedFetch(`${API}/v1/files/upload`, { method: "POST", headers: this.auth(apiKey), body: form });
    const upload = await uploaded.json() as MiniMaxResponse & { file?: { file_id: number }; file_id?: number }; this.assertSuccess(upload);
    const fileId = upload.file?.file_id ?? upload.file_id; if (!fileId) throw new ProviderError("MiniMax did not return a file ID.");
    const providerVoiceId = this.voiceId(input.name);
    const response = await checkedFetch(`${API}/v1/voice_clone`, { method: "POST", headers: this.jsonHeaders(apiKey), body: JSON.stringify({
      file_id: fileId, voice_id: providerVoiceId, text: input.previewText || undefined, model: "speech-2.8-hd",
      need_noise_reduction: input.removeBackgroundNoise, need_volume_normalization: true }) });
    const result = await response.json() as MiniMaxResponse & { demo_audio?: string }; this.assertSuccess(result);
    return voiceRecord(this.id, providerVoiceId, input.name, input.description, "cloned", result.demo_audio || undefined,
      { requiresActivation: true, providerCategory: "cloned" });
  }
  async design(value: string | undefined, input: DesignVoiceInput): Promise<DesignPreview[]> {
    const apiKey = requireApiKey(value, "MiniMax");
    const response = await checkedFetch(`${API}/v1/voice_design`, { method: "POST", headers: this.jsonHeaders(apiKey), body: JSON.stringify({ prompt: input.prompt, preview_text: input.previewText }) });
    const result = await response.json() as MiniMaxResponse & { trial_audio: string; voice_id: string }; this.assertSuccess(result);
    return [{ id: crypto.randomUUID(), provider: this.id, generatedVoiceId: result.voice_id,
      audioUrl: `data:audio/mpeg;base64,${Buffer.from(result.trial_audio, "hex").toString("base64")}`,
      expiresAt: new Date(Date.now() + 604800000).toISOString() }];
  }
  async saveDesign(_apiKey: string | undefined, input: SaveDesignInput): Promise<VoiceRecord> {
    return voiceRecord(this.id, input.preview.generatedVoiceId, input.name, input.description, "generated", input.preview.audioUrl,
      { requiresActivation: true, providerCategory: "generated" });
  }
  async synthesize(value: string | undefined, input: SynthesisInput): Promise<GeneratedSpeech> {
    const apiKey = requireApiKey(value, "MiniMax"); const model = "speech-2.8-hd";
    const response = await checkedFetch(`${API}/v1/t2a_v2`, { method: "POST", headers: this.jsonHeaders(apiKey), body: JSON.stringify({
      model, text: input.text, stream: false, language_boost: input.language || "auto", output_format: "hex",
      subtitle_enable: true, subtitle_type: "word",
      voice_setting: { voice_id: input.voice.providerVoiceId, speed: minimaxSpeed(input.speed), vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    }) });
    const data = await response.json() as MiniMaxSpeechResponse; this.assertSuccess(data);
    if (!data.data?.audio) throw new ProviderError("MiniMax did not return generated audio.");
    return { bytes: new Uint8Array(Buffer.from(data.data.audio, "hex")), mimeType: "audio/mpeg", extension: ".mp3", model,
      words: await readMiniMaxSubtitles(data.data.subtitle_file) };
  }
  private async getVoices(apiKey: string, voiceType: string): Promise<MiniMaxResponse & { system_voice?: MiniMaxVoice[]; voice_cloning?: MiniMaxVoice[]; voice_generation?: MiniMaxVoice[] }> {
    const response = await checkedFetch(`${API}/v1/get_voice`, { method: "POST", headers: this.jsonHeaders(apiKey), body: JSON.stringify({ voice_type: voiceType }) });
    const data = await response.json() as MiniMaxResponse & { system_voice?: MiniMaxVoice[]; voice_cloning?: MiniMaxVoice[]; voice_generation?: MiniMaxVoice[] }; this.assertSuccess(data); return data;
  }
  private assertSuccess(response: MiniMaxResponse) { if (response.base_resp && response.base_resp.status_code !== 0) throw new ProviderError(response.base_resp.status_msg || `MiniMax error ${response.base_resp.status_code}`); }
  private auth(apiKey: string) { return { authorization: `Bearer ${apiKey}` }; }
  private jsonHeaders(apiKey: string) { return { ...this.auth(apiKey), "content-type": "application/json" }; }
  private voiceId(name: string) { let slug = name.normalize("NFKD").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^([^a-zA-Z])/, "V$1").replace(/[-_]+$/, ""); if (!slug) slug = "DialogueVoice"; slug = `${slug}_${Date.now().toString(36).slice(-6)}`; return slug.slice(0, 256).replace(/[-_]+$/, "0").padEnd(8, "0"); }
  private readableName(id: string) { return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
}

interface MiniMaxSpeechResponse extends MiniMaxResponse { data?: { audio?: string; subtitle_file?: string }; }
function minimaxSpeed(speed: SynthesisInput["speed"]): number { return speed === "slow" ? 0.9 : speed === "fast" ? 1.1 : 1; }
async function readMiniMaxSubtitles(url?: string): Promise<GeneratedSpeech["words"]> {
  if (!url) return [];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (!response.ok) return [];
    const content = await response.text();
    try { return subtitleWordsFromJson(JSON.parse(content)); } catch { return subtitleWordsFromText(content); }
  } catch { return []; }
}
function subtitleWordsFromJson(value: unknown): GeneratedSpeech["words"] {
  const output: GeneratedSpeech["words"] = [];
  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (!entry || typeof entry !== "object") return;
    const item = entry as Record<string, unknown>; const text = String(item.text ?? item.word ?? item.content ?? "").trim();
    const start = timeValue(item.start_time ?? item.start ?? item.time_begin ?? item.begin_time); const end = timeValue(item.end_time ?? item.end ?? item.time_end ?? item.end_time);
    if (text && start !== undefined && end !== undefined) output.push({ text, type: "word", startSeconds: start, endSeconds: end });
    else Object.values(item).forEach(visit);
  };
  visit(value); return output;
}
function subtitleWordsFromText(content: string): GeneratedSpeech["words"] {
  const output: GeneratedSpeech["words"] = []; const pattern = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*\r?\n([^\r\n]+)/g; let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) { const start = clock(match.slice(1, 5)); const end = clock(match.slice(5, 9)); const tokens = match[9].trim().split(/\s+/); const duration = (end - start) / Math.max(1, tokens.length);
    tokens.forEach((text, index) => output.push({ text, type: "word", startSeconds: start + duration * index, endSeconds: start + duration * (index + 1) })); }
  return output;
}
function timeValue(value: unknown): number | undefined { const number = Number(value); if (!Number.isFinite(number)) return undefined; return number > 1000 ? number / 1000 : number; }
function clock(parts: string[]): number { return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]) + Number(parts[3]) / 1000; }
