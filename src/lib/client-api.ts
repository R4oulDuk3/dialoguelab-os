import type { DialogueApi } from "@/shared/contracts";

export class DialogueApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly currentRevision?: number) { super(message); this.name = "DialogueApiError"; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string; currentRevision?: number } & T;
  if (!response.ok) throw new DialogueApiError(body.error || `Request failed (${response.status})`, response.status, body.code, body.currentRevision);
  return body;
}

async function requestForm<T>(url: string, form: FormData, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, body: form });
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string; currentRevision?: number } & T;
  if (!response.ok) throw new DialogueApiError(body.error || `Request failed (${response.status})`, response.status, body.code, body.currentRevision);
  return body;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export const dialogueApi: DialogueApi = {
  projects: {
    list: () => request("/api/projects"),
    get: (id) => request(`/api/projects?id=${encodeURIComponent(id)}`),
    create: (input) => request("/api/projects", { method: "POST", body: JSON.stringify(input) }),
    update: (input) => request("/api/projects", { method: "PATCH", body: JSON.stringify(input) }),
    timeline: (id) => request(`/api/projects/${encodeURIComponent(id)}/timeline`),
    commands: (input) => request(`/api/projects/${encodeURIComponent(input.localProjectId)}/commands`, { method: "POST", body: JSON.stringify(input) }),
    history: (id, limit = 50) => request(`/api/projects/${encodeURIComponent(id)}/history?limit=${limit}`),
    undo: (id, expectedRevision) => request(`/api/projects/${encodeURIComponent(id)}/undo`, { method: "POST", body: JSON.stringify({ expectedRevision }) }),
    redo: (id, expectedRevision) => request(`/api/projects/${encodeURIComponent(id)}/redo`, { method: "POST", body: JSON.stringify({ expectedRevision }) }),
    remove: (id) => request(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    render: (id, quality = "standard") => request("/api/projects/render", { method: "POST", body: JSON.stringify({ localProjectId: id, quality }) }),
    renders: (id) => request(`/api/projects/render?projectId=${encodeURIComponent(id)}`),
    cancelRender: (renderId) => request("/api/projects/render", { method: "PATCH", body: JSON.stringify({ renderId, operation: "cancel" }) }),
    retryRender: (renderId) => request("/api/projects/render", { method: "PATCH", body: JSON.stringify({ renderId, operation: "retry" }) }),
    removeRender: (renderId) => request(`/api/projects/render?renderId=${encodeURIComponent(renderId)}`, { method: "DELETE" }),
  },
  providers: {
    status: () => request("/api/providers"),
    configure: (provider, apiKey) => request("/api/providers", { method: "POST", body: JSON.stringify({ provider, apiKey }) }),
    disconnect: (provider) => request("/api/providers", { method: "DELETE", body: JSON.stringify({ provider }) }),
    speechToText: () => request("/api/providers/speech-to-text"),
    configureSpeechToText: (provider, model) => request("/api/providers/speech-to-text", { method: "PATCH", body: JSON.stringify({ provider, model }) }),
  },
  voices: {
    list: () => request("/api/voices"),
    listRemote: (provider) => request(`/api/voices/remote?provider=${provider}`),
    link: (input) => request("/api/voices", { method: "POST", body: JSON.stringify({ operation: "link", input }) }),
    clone: (input) => request("/api/voices", { method: "POST", body: JSON.stringify({ operation: "clone", input: { ...input,
      audio: { ...input.audio, bytes: base64(input.audio.bytes) } } }) }),
    design: (input) => request("/api/voices", { method: "POST", body: JSON.stringify({ operation: "design", input }) }),
    saveDesign: (input) => request("/api/voices", { method: "POST", body: JSON.stringify({ operation: "save-design", input }) }),
    update: (input) => request("/api/voices", { method: "POST", body: JSON.stringify({ operation: "update", input: {
      ...input, image: input.image ? { ...input.image, bytes: base64(input.image.bytes) } : undefined,
    } }) }),
    remove: (id) => request(`/api/voices?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  characters: {
    list: () => request("/api/characters"),
    create: (input) => request("/api/characters", { method: "POST", body: JSON.stringify({ ...input, images: input.images.map((image) => ({
      ...image, bytes: base64(image.bytes),
    })) }) }),
    update: (input) => request("/api/characters", { method: "PATCH", body: JSON.stringify({ ...input, newImages: input.newImages.map((image) => ({
      ...image, bytes: base64(image.bytes),
    })) }) }),
    remove: (id) => request(`/api/characters?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  backgrounds: {
    list: () => request("/api/backgrounds"),
    create: (input) => {
      const form = new FormData();
      form.set("name", input.name); form.set("description", input.description); form.set("width", String(input.width));
      form.set("height", String(input.height)); form.set("durationSeconds", String(input.durationSeconds));
      form.set("video", new Blob([input.video.bytes as BlobPart], { type: input.video.mimeType }), input.video.name);
      return requestForm("/api/backgrounds", form, { method: "POST" });
    },
    update: (input) => request("/api/backgrounds", { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id) => request(`/api/backgrounds?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  fonts: {
    list: () => request("/api/fonts"),
    import: (input) => { const form = new FormData(); form.set("family", input.family); form.set("font", new Blob([input.file.bytes as BlobPart], { type: input.file.mimeType }), input.file.name); return requestForm("/api/fonts", form, { method: "POST" }); },
    remove: (id) => request(`/api/fonts?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  media: {
    list: () => request("/api/media"),
    create: (input) => { const form = new FormData(); form.set("name", input.name); form.set("width", String(input.width)); form.set("height", String(input.height));
      form.set("durationSeconds", String(input.durationSeconds)); form.set("file", new Blob([input.file.bytes as BlobPart], { type: input.file.mimeType }), input.file.name);
      return requestForm("/api/media", form, { method: "POST" }); },
    remove: (id) => request(`/api/media?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  speech: {
    list: (voiceId) => request(`/api/speech${voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : ""}`),
    runtime: (voiceId) => request(`/api/speech/runtime?voiceId=${encodeURIComponent(voiceId)}`),
    subtitleStatus: () => request("/api/speech/subtitles"),
    installSubtitles: () => request("/api/speech/subtitles", { method: "POST" }),
    generate: (input) => request("/api/speech", { method: "POST", body: JSON.stringify(input) }),
    remove: (id) => request(`/api/speech?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
};
