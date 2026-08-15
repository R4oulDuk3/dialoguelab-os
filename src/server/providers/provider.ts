import type { CloneVoiceInput, DesignPreview, DesignVoiceInput, ProviderId, RemoteVoice, SaveDesignInput, SpeechWord, TextToSpeechSpeed, VoiceRecord } from "@/shared/contracts";

export interface SynthesisInput { voice: VoiceRecord; text: string; speed: TextToSpeechSpeed; language?: string; }
export interface GeneratedSpeech { bytes: Uint8Array; mimeType: string; extension: string; model: string; words: SpeechWord[]; }

export interface VoiceProvider {
  readonly id: ProviderId;
  validateKey(apiKey?: string): Promise<void>;
  listVoices(apiKey?: string): Promise<RemoteVoice[]>;
  clone(apiKey: string | undefined, input: CloneVoiceInput): Promise<VoiceRecord>;
  design(apiKey: string | undefined, input: DesignVoiceInput): Promise<DesignPreview[]>;
  saveDesign(apiKey: string | undefined, input: SaveDesignInput): Promise<VoiceRecord>;
  synthesize(apiKey: string | undefined, input: SynthesisInput): Promise<GeneratedSpeech>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "ProviderError"; }
}

export async function checkedFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
  if (response.ok) return response;
  let detail = "";
  try {
    const body = await response.json() as Record<string, unknown>;
    const base = body.base_resp as { status_msg?: string } | undefined;
    detail = readableProviderError(body.detail ?? body.message ?? base?.status_msg ?? body);
  } catch { detail = await response.text(); }
  throw new ProviderError(detail || `Provider request failed (${response.status})`, response.status);
}

export function readableProviderError(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readableProviderError).filter(Boolean).join(" · ");
  if (!value || typeof value !== "object") return "";

  const error = value as Record<string, unknown>;
  for (const key of ["message", "msg", "status_msg", "detail", "error", "reason"]) {
    const message = readableProviderError(error[key]);
    if (message) return message;
  }

  const entries = Object.entries(error)
    .map(([key, entry]) => {
      const message = readableProviderError(entry);
      return message ? `${humanize(key)}: ${message}` : "";
    })
    .filter(Boolean);
  return entries.join(" · ");
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function voiceRecord(provider: ProviderId, providerVoiceId: string, name: string, description: string,
  kind: VoiceRecord["kind"], previewUrl?: string, extra: Partial<VoiceRecord> = {}): VoiceRecord {
  return { id: crypto.randomUUID(), provider, providerVoiceId, name, description, kind, previewUrl, createdAt: new Date().toISOString(), ...extra };
}

export function requireApiKey(apiKey: string | undefined, provider: string): string {
  if (!apiKey) throw new ProviderError(`${provider} is not connected.`);
  return apiKey;
}
