import type { CloneVoiceInput, DesignPreview, DesignVoiceInput, RemoteVoice, SaveDesignInput, VoiceRecord } from "@/shared/contracts";
import { checkedFetch, ProviderError, requireApiKey, voiceRecord, type GeneratedSpeech, type SynthesisInput, type VoiceProvider } from "./provider";

const API = "https://api.fish.audio";
const TTS_MODEL = "s2.1-pro-free";

interface FishModel {
  _id: string;
  title: string;
  description?: string;
  visibility?: "public" | "unlist" | "private";
  languages?: string[];
  tags?: string[];
}

export class FishAudioProvider implements VoiceProvider {
  readonly id = "fish" as const;

  async validateKey(value?: string): Promise<void> {
    const apiKey = requireApiKey(value, "Fish Audio");
    await checkedFetch(`${API}/model?page_size=1&page_number=1&self=true`, { headers: this.headers(apiKey) });
  }

  async listVoices(value?: string): Promise<RemoteVoice[]> {
    const apiKey = requireApiKey(value, "Fish Audio");
    const response = await checkedFetch(`${API}/model?page_size=100&page_number=1&self=true&sort_by=created_at`, { headers: this.headers(apiKey) });
    const data = await response.json() as { items?: FishModel[] };
    return (data.items ?? []).map((model) => ({
      provider: this.id,
      providerVoiceId: model._id,
      name: model.title,
      description: model.description || model.languages?.join(" · ") || "Fish Audio voice",
      category: model.visibility || model.tags?.[0] || "voice",
    }));
  }

  async clone(value: string | undefined, input: CloneVoiceInput): Promise<VoiceRecord> {
    const apiKey = requireApiKey(value, "Fish Audio");
    const form = new FormData();
    form.append("type", "tts");
    form.append("title", input.name);
    form.append("train_mode", "fast");
    form.append("visibility", "private");
    form.append("description", input.description);
    form.append("enhance_audio_quality", String(input.removeBackgroundNoise));
    form.append("generate_sample", "false");
    form.append("voices", new Blob([input.audio.bytes as BlobPart], { type: input.audio.mimeType }), input.audio.name);
    if (input.previewText?.trim()) form.append("texts", input.previewText.trim());

    const response = await checkedFetch(`${API}/model`, { method: "POST", headers: this.headers(apiKey), body: form });
    const model = await response.json() as FishModel;
    if (!model._id) throw new ProviderError("Fish Audio did not return a voice model ID.");
    return voiceRecord(this.id, model._id, model.title || input.name, model.description || input.description, "cloned", undefined,
      { providerCategory: model.visibility || "private" });
  }

  async design(_value: string | undefined, _input: DesignVoiceInput): Promise<DesignPreview[]> {
    throw new ProviderError("Fish Audio Voice Design is not available in Dialogue Lab.");
  }

  async saveDesign(_value: string | undefined, _input: SaveDesignInput): Promise<VoiceRecord> {
    throw new ProviderError("Fish Audio Voice Design is not available in Dialogue Lab.");
  }

  async synthesize(value: string | undefined, input: SynthesisInput): Promise<GeneratedSpeech> {
    const apiKey = requireApiKey(value, "Fish Audio");
    const response = await checkedFetch(`${API}/v1/tts`, {
      method: "POST",
      headers: { ...this.headers(apiKey), "content-type": "application/json", model: TTS_MODEL },
      body: JSON.stringify({
        text: input.text,
        reference_id: input.voice.providerVoiceId,
        format: "mp3",
        sample_rate: 44100,
        mp3_bitrate: 128,
        normalize: true,
        latency: "normal",
        prosody: { speed: fishSpeed(input.speed), volume: 0, normalize_loudness: true },
      }),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new ProviderError("Fish Audio did not return generated audio.");
    return { bytes, mimeType: "audio/mpeg", extension: ".mp3", model: TTS_MODEL, words: [] };
  }

  private headers(apiKey: string) { return { authorization: `Bearer ${apiKey}` }; }
}

function fishSpeed(speed: SynthesisInput["speed"]): number {
  return speed === "slow" ? 0.8 : speed === "fast" ? 1.2 : 1;
}
