import type {
  BackgroundRecord, CharacterImageUpload, CharacterRecord, CloneVoiceInput, CreateBackgroundInput, CreateCharacterInput, CreateProjectInput, CreateProjectMediaInput, DesignPreview, DesignVoiceInput, GenerateSpeechInput, LinkVoiceInput, ProjectEditorState, ProjectMediaAssetRecord, ProjectRecord, ProviderId, ProviderStatus,
  ElevenLabsSpeechToTextModel, RemoteVoice, SaveDesignInput, SpeechClipRecord, SpeechRuntimeStatus, SpeechTimingSource, SpeechToTextConfiguration, SpeechToTextProviderId, SpeechWord, SubtitleEngineStatus, UpdateBackgroundInput, UpdateCharacterInput, UpdateProjectInput, UpdateVoiceInput, VoiceRecord,
} from "@/shared/contracts";
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { appMetadataRepository, credentialRepository, voiceRepository } from "./repositories";
import { characterRepository } from "./character-repository";
import { backgroundRepository } from "./background-repository";
import { mediaRepository } from "./media-repository";
import { speechRepository } from "./speech-repository";
import { projectRepository } from "./project-repository";
import { dataDirectory } from "./database";
import { elevenLabsWords, ElevenLabsProvider } from "./providers/elevenlabs";
import { FishAudioProvider } from "./providers/fish";
import { MiniMaxProvider } from "./providers/minimax";
import type { VoiceProvider } from "./providers/provider";
import { startWhisperInstall, whisperStatus, whisperWords } from "./whisper";
import { DEFAULT_CAPTION_STYLE, DEFAULT_FAKE_TEXT_SETTINGS, PROJECT_STATE_VERSION, dialogueBlocks } from "@/shared/project-timeline";
import { validateProjectState } from "./project-validation";
import { projectCommandService } from "./project-command-service";

const execFileAsync = promisify(execFile);

export const projectService = {
  list(): ProjectRecord[] { return projectRepository.list(); },
  get(id: string): ProjectRecord {
    const project = projectRepository.get(id); if (!project) throw new Error("Project not found."); return project;
  },
  create(input: CreateProjectInput): ProjectRecord {
    const name = validateProjectName(input.name); const description = validateProjectDescription(input.description);
    const projectType = input.projectType === "reddit-story" ? "reddit-story" : input.projectType === "fake-text" ? "fake-text" : "dialogue";
    if (projectType !== "dialogue" && process.env.DIALOGUELAB_ENABLE_EXPERIMENTAL_PROJECTS !== "1") {
      throw new Error("This project type is still in development. Set DIALOGUELAB_ENABLE_EXPERIMENTAL_PROJECTS=1 to test it.");
    }
    const backgrounds = backgroundRepository.list();
    const defaultBackgroundId = projectType === "dialogue"
      ? backgrounds.length ? backgrounds[Math.floor(Math.random() * backgrounds.length)].id : undefined
      : backgrounds[0]?.id;
    const storyBlockId = crypto.randomUUID();
    const editorState = validateProjectState({ schemaVersion: PROJECT_STATE_VERSION, canvas: { width: input.width, height: input.height, fps: input.fps },
      projectType, fakeText: DEFAULT_FAKE_TEXT_SETTINGS, assets: { backgroundId: defaultBackgroundId, backgroundStartSeconds: 0, characterIds: [] },
      captions: projectType === "reddit-story" ? { ...DEFAULT_CAPTION_STYLE, activeWordColor: "#FF4500" } : DEFAULT_CAPTION_STYLE,
      captionAnimation: { preset: projectType === "reddit-story" ? "pop" : "none", durationSeconds: .2 }, timeline: { mode: "flow", tracks: [], items: [] },
      blocks: projectType === "fake-text" ? fakeTextStarterBlocks() : projectType === "reddit-story" ? [{ id: storyBlockId, kind: "dialogue-line", order: 0, data: {
        characterId: "", characterImageId: "", text: "Paste or write the Reddit story here.", position: "center", speechSpeed: "fast", gapAfterSeconds: 0,
        hideSubtitles: false, redditPost: { sourceUrl: "", subreddit: "stories", username: "storyteller", postedAgo: "3h", title: "Paste a Reddit URL or write your own title", upvotes: "4.2k", comments: "328" },
      } }] : [], scenes: [], tracks: [] });
    const now = new Date().toISOString();
    return projectRepository.create({ id: crypto.randomUUID(), name, description, editorState, revision: 0, canUndo: false, canRedo: false, createdAt: now, updatedAt: now });
  },
  update(input: UpdateProjectInput): ProjectRecord {
    const current = this.get(input.localProjectId);
    const metadataUpdated = projectRepository.update({ ...current,
      name: input.name === undefined ? current.name : validateProjectName(input.name),
      description: input.description === undefined ? current.description : validateProjectDescription(input.description),
      editorState: current.editorState,
      updatedAt: new Date().toISOString(),
    });
    if (input.editorState === undefined) return metadataUpdated;
    return projectCommandService.apply({ localProjectId: current.id, expectedRevision: input.expectedRevision,
      source: "system", summary: "Replaced project editor state", commands: [{ kind: "replace-editor-state", editorState: validateProjectState(input.editorState) }] }).project;
  },
  remove(id: string): void { if (!projectRepository.get(id)) return; projectRepository.remove(id); },
};

function fakeTextStarterBlocks() {
  return [
    { side: "incoming", sender: "Jessica", text: "we need to talk jake" },
    { side: "outgoing", sender: "Jake", text: "about?" },
    { side: "incoming", sender: "Jessica", text: "i know what you did friday night" },
    { side: "outgoing", sender: "Jake", text: "but what is 'knowing' really?" },
  ].map((data, order) => ({ id: crypto.randomUUID(), kind: "fake-text-message", order, data }));
}

const providers: Record<ProviderId, VoiceProvider> = { elevenlabs: new ElevenLabsProvider(), minimax: new MiniMaxProvider(), fish: new FishAudioProvider() };
const metadata: Record<ProviderId, { name: string; docsUrl: string; description: string; capabilities: Array<"existing" | "clone" | "design"> }> = {
  elevenlabs: { name: "ElevenLabs", docsUrl: "https://elevenlabs.io/app/settings/api-keys", description: "Cloning, voice library and Voice Design", capabilities: ["existing", "clone", "design"] },
  minimax: { name: "MiniMax", docsUrl: "https://platform.minimax.io/user-center/basic-information/interface-key", description: "System voices, rapid cloning and Voice Design", capabilities: ["existing", "clone", "design"] },
  fish: { name: "Fish Audio", docsUrl: "https://fish.audio/app/api-keys", description: "Voice library, instant cloning and multilingual TTS", capabilities: ["existing", "clone"] },
};

function capabilitiesFor(provider: ProviderId): Array<"existing" | "clone" | "design"> { return metadata[provider].capabilities; }

export function assertProvider(value: unknown): asserts value is ProviderId {
  if (value !== "elevenlabs" && value !== "minimax" && value !== "fish") throw new Error("Unsupported voice provider.");
}

export function assertSpeechToTextProvider(value: unknown): asserts value is SpeechToTextProviderId {
  if (value !== "faster-whisper" && value !== "elevenlabs") throw new Error("Unsupported speech-to-text provider.");
}

function speechToTextSettings(): { provider: SpeechToTextProviderId; model: ElevenLabsSpeechToTextModel } {
  const provider = appMetadataRepository.get("speech_to_text_provider");
  const model = appMetadataRepository.get("elevenlabs_stt_model");
  return { provider: provider === "elevenlabs" ? "elevenlabs" : "faster-whisper", model: model === "scribe_v1" ? "scribe_v1" : "scribe_v2" };
}

function keyFor(provider: ProviderId): string | undefined {
  const key = credentialRepository.get(provider);
  if (!key) throw new Error(`${metadata[provider].name} is not connected.`);
  return key;
}

export const providerService = {
  statuses(): ProviderStatus[] {
    return (Object.keys(providers) as ProviderId[]).map((id) => ({ id, ...metadata[id], capabilities: capabilitiesFor(id),
      configured: Boolean(credentialRepository.hint(id)), keyHint: credentialRepository.hint(id), security: "encrypted" }));
  },
  async configure(provider: ProviderId, apiKey: string): Promise<ProviderStatus[]> {
    if (apiKey.trim().length < 8) throw new Error("Enter a valid API key.");
    const key = apiKey.trim(); await providers[provider].validateKey(key); credentialRepository.set(provider, key); return this.statuses();
  },
  disconnect(provider: ProviderId): ProviderStatus[] {
    credentialRepository.remove(provider); return this.statuses();
  },
  speechToTextStatus(): SpeechToTextConfiguration {
    const settings = speechToTextSettings(); const localStatus = whisperStatus(); const keyHint = credentialRepository.hint("elevenlabs");
    return { selected: settings.provider, elevenLabsModel: settings.model, providers: [
      { id: "faster-whisper", name: "Whisper Fast", description: "Fast, private transcription that runs entirely on this machine.", configured: localStatus.state === "ready", localStatus },
      { id: "elevenlabs", name: "ElevenLabs Scribe", description: "Cloud transcription with precise word timestamps and broad language support.", configured: Boolean(keyHint), keyHint },
    ] };
  },
  configureSpeechToText(provider: SpeechToTextProviderId, model: ElevenLabsSpeechToTextModel = "scribe_v2"): SpeechToTextConfiguration {
    if (model !== "scribe_v1" && model !== "scribe_v2") throw new Error("Choose a supported ElevenLabs transcription model.");
    if (provider === "elevenlabs" && !credentialRepository.hint("elevenlabs")) throw new Error("Connect ElevenLabs before selecting it for speech to text.");
    appMetadataRepository.set("speech_to_text_provider", provider); appMetadataRepository.set("elevenlabs_stt_model", model);
    return this.speechToTextStatus();
  },
};

export const voiceService = {
  list(): VoiceRecord[] { return voiceRepository.list(); },
  listRemote(provider: ProviderId): Promise<RemoteVoice[]> {
    if (!capabilitiesFor(provider).includes("existing")) throw new Error(`${metadata[provider].name} does not expose an available voice library.`);
    return providers[provider].listVoices(keyFor(provider));
  },
  link(input: LinkVoiceInput): VoiceRecord {
    const { voice } = input; keyFor(voice.provider);
    return voiceRepository.add({ id: crypto.randomUUID(), provider: voice.provider, providerVoiceId: voice.providerVoiceId,
      name: voice.name, description: voice.description, kind: "existing", previewUrl: voice.previewUrl,
      providerCategory: voice.category, createdAt: new Date().toISOString() });
  },
  async clone(input: CloneVoiceInput): Promise<VoiceRecord> {
    if (!input.name.trim() || !input.audio.bytes.length) throw new Error("A name and source recording are required.");
    if (input.audio.bytes.length > 20 * 1024 * 1024) throw new Error("Audio files must be 20 MB or smaller.");
    if (!capabilitiesFor(input.provider).includes("clone")) throw new Error(`${metadata[input.provider].name} does not support voice cloning.`);
    return voiceRepository.add(await providers[input.provider].clone(keyFor(input.provider), input));
  },
  design(input: DesignVoiceInput): Promise<DesignPreview[]> {
    if (!capabilitiesFor(input.provider).includes("design")) throw new Error(`${metadata[input.provider].name} does not support Voice Design with this model.`);
    if (input.prompt.trim().length < 20) throw new Error("Describe the voice in at least 20 characters.");
    if (!input.previewText.trim()) throw new Error("Preview text is required.");
    if (input.provider === "elevenlabs" && input.previewText.trim().length < 100) throw new Error("ElevenLabs preview text must contain at least 100 characters.");
    if (input.provider === "elevenlabs" && input.previewText.length > 1000) throw new Error("ElevenLabs preview text cannot exceed 1,000 characters.");
    if (input.provider === "minimax" && input.previewText.length > 500) throw new Error("MiniMax preview text cannot exceed 500 characters.");
    return providers[input.provider].design(keyFor(input.provider), input);
  },
  async saveDesign(input: SaveDesignInput): Promise<VoiceRecord> {
    return voiceRepository.add(await providers[input.provider].saveDesign(keyFor(input.provider), input));
  },
  update(input: UpdateVoiceInput): VoiceRecord {
    const voice = voiceRepository.get(input.localVoiceId);
    if (!voice) throw new Error("Voice not found.");
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("Voice name cannot be empty.");
      if (name.length > 80) throw new Error("Voice name cannot exceed 80 characters.");
      voiceRepository.updateName(input.localVoiceId, name);
    }
    if (input.image) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(input.image.mimeType)) throw new Error("Use a JPG, PNG, or WebP image.");
      if (!input.image.bytes.length) throw new Error("The selected image is empty.");
      if (input.image.bytes.length > 5 * 1024 * 1024) throw new Error("Voice images must be 5 MB or smaller.");
      voiceRepository.setImage(input.localVoiceId, input.image);
    }
    return voiceRepository.get(input.localVoiceId)!;
  },
  image(id: string) { return voiceRepository.image(id); },
  remove(id: string): void {
    const users = characterRepository.list().filter((character) => character.voiceId === id);
    if (users.length) throw new Error(`Reassign the voice for ${users.map((character) => character.name).join(", ")} before removing it.`);
    voiceRepository.remove(id);
  },
};

export const characterService = {
  list(): CharacterRecord[] { return characterRepository.list(); },
  create(input: CreateCharacterInput): CharacterRecord {
    const name = validateCharacterDetails(input);
    if (!input.images.length) throw new Error("Add at least one character image.");
    if (input.images.length > 20) throw new Error("A character can have up to 20 images.");
    input.images.forEach(validateNewCharacterImage);
    return characterRepository.create({ ...input, name, description: input.description.trim(), images: input.images.map((image, index) => ({
      ...image, label: image.label.trim() || `Pose ${index + 1}`,
    })) });
  },
  update(input: UpdateCharacterInput): CharacterRecord {
    const current = characterRepository.get(input.localCharacterId);
    if (!current) throw new Error("Character not found.");
    const name = validateCharacterDetails(input);
    const imageCount = input.existingImages.length + input.newImages.length;
    if (!imageCount) throw new Error("Keep or add at least one character image.");
    if (imageCount > 20) throw new Error("A character can have up to 20 images.");
    const currentIds = new Set(current.images.map((image) => image.id));
    if (new Set(input.existingImages.map((image) => image.id)).size !== input.existingImages.length || input.existingImages.some((image) => !currentIds.has(image.id)))
      throw new Error("One or more character images could not be found.");
    input.existingImages.forEach(validateCharacterImageDetails);
    input.newImages.forEach(validateNewCharacterImage);
    const keptImageIds = new Set(input.existingImages.map((image) => image.id));
    const removedImageIds = current.images.map((image) => image.id).filter((id) => !keptImageIds.has(id));
    if (removedImageIds.length) {
      const usedIn = projectService.list().filter((project) =>
        dialogueBlocks(project.editorState).some((line) => removedImageIds.includes(line.data.characterImageId))
        || project.editorState.timeline.items.some((item) => item.characterId === current.id && item.characterImageId !== undefined && removedImageIds.includes(item.characterImageId)));
      if (usedIn.length) throw new Error(`This pose is used by ${usedIn.map((project) => project.name).join(", ")}. Replace it in those projects before deleting it.`);
    }
    const updated = characterRepository.update({ ...input, name, description: input.description.trim(),
      existingImages: input.existingImages.map((image, index) => ({ ...image, label: image.label.trim() || `Pose ${index + 1}` })),
      newImages: input.newImages.map((image, index) => ({ ...image, label: image.label.trim() || `Pose ${input.existingImages.length + index + 1}` })),
    });
    if (current.voiceId !== updated.voiceId) {
      for (const project of projectService.list()) {
        const affected = dialogueBlocks(project.editorState).filter((line) => line.data.characterId === updated.id && (line.data.speechClipId || line.data.captionWordsOverride));
        if (!affected.length) continue;
        projectCommandService.apply({ localProjectId: project.id, source: "system", summary: `Invalidated dialogue audio after changing ${updated.name}'s voice`,
          commands: affected.map((line) => ({ kind: "update-dialogue-line" as const, lineId: line.id, patch: { speechClipId: undefined, captionWordsOverride: undefined } })),
        });
      }
    }
    return updated;
  },
  image(id: string) { return characterRepository.image(id); },
  remove(id: string): void {
    const usedIn = projectService.list().filter((project) => project.editorState.assets.characterIds.includes(id)
      || dialogueBlocks(project.editorState).some((line) => line.data.characterId === id)
      || project.editorState.timeline.items.some((item) => item.characterId === id));
    if (usedIn.length) throw new Error(`Remove this character from ${usedIn.map((project) => project.name).join(", ")} before deleting it.`);
    characterRepository.remove(id);
  },
};

const backgroundDirectory = join(dataDirectory, "backgrounds");
const backgroundThumbnailDirectory = join(dataDirectory, "background-thumbnails");
const backgroundMimeTypes = new Map([
  ["video/mp4", ".mp4"], ["video/webm", ".webm"], ["video/quicktime", ".mov"],
]);

export const backgroundService = {
  list(): BackgroundRecord[] { return backgroundRepository.list(); },
  async create(input: CreateBackgroundInput): Promise<BackgroundRecord> {
    const details = validateBackground(input);
    await mkdir(backgroundDirectory, { recursive: true });
    const id = crypto.randomUUID(); const storageName = `${id}${details.extension}`; const target = join(backgroundDirectory, storageName);
    await writeFile(target, input.video.bytes);
    try {
      const record = backgroundRepository.create({ id, name: details.name, description: input.description.trim(), fileName: input.video.name,
        storageName, mimeType: input.video.mimeType, sizeBytes: input.video.bytes.length, width: input.width, height: input.height,
        durationSeconds: input.durationSeconds, createdAt: new Date().toISOString() });
      await createBackgroundThumbnail(target, join(backgroundThumbnailDirectory, `${id}.jpg`), input.durationSeconds).catch(() => undefined); return record;
    } catch (error) { await unlink(target).catch(() => undefined); throw error; }
  },
  async importFile(input: Omit<CreateBackgroundInput, "video"> & { videoPath: string; mimeType: string; fileName: string }): Promise<BackgroundRecord> {
    const source = input.videoPath; const sourceStat = await stat(source);
    const details = validateBackgroundDetails({ ...input, videoName: input.fileName, mimeType: input.mimeType, sizeBytes: sourceStat.size });
    await mkdir(backgroundDirectory, { recursive: true });
    const id = crypto.randomUUID(); const storageName = `${id}${details.extension}`; const target = join(backgroundDirectory, storageName);
    await copyFile(source, target);
    try {
      const record = backgroundRepository.create({ id, name: details.name, description: input.description.trim(), fileName: input.fileName,
        storageName, mimeType: input.mimeType, sizeBytes: sourceStat.size, width: input.width, height: input.height,
        durationSeconds: input.durationSeconds, createdAt: new Date().toISOString() });
      await createBackgroundThumbnail(target, join(backgroundThumbnailDirectory, `${id}.jpg`), input.durationSeconds).catch(() => undefined); return record;
    } catch (error) { await unlink(target).catch(() => undefined); throw error; }
  },
  file(id: string): { path: string; record: BackgroundRecord } | undefined {
    const stored = backgroundRepository.get(id);
    if (!stored) return undefined;
    const { storageName, ...record } = stored;
    return { path: join(backgroundDirectory, storageName), record };
  },
  update(input: UpdateBackgroundInput): BackgroundRecord {
    const name = input.name.trim().slice(0, 100); if (!name) throw new Error("Enter a background name.");
    if (!backgroundRepository.get(input.localBackgroundId)) throw new Error("Background not found.");
    return backgroundRepository.update(input.localBackgroundId, { name, description: input.description.trim().slice(0, 500) });
  },
  async thumbnail(id: string): Promise<string | undefined> {
    const stored = backgroundRepository.get(id); if (!stored) return undefined; const target = join(backgroundThumbnailDirectory, `${id}.jpg`);
    try { await stat(target); return target; } catch { await createBackgroundThumbnail(join(backgroundDirectory, stored.storageName), target, stored.durationSeconds).catch(() => undefined); }
    try { await stat(target); return target; } catch { return undefined; }
  },
  async remove(id: string): Promise<void> {
    const stored = backgroundRepository.get(id);
    if (!stored) return;
    const usedIn = projectService.list().filter((project) => project.editorState.assets.backgroundId === id);
    if (usedIn.length) throw new Error(`Choose a different background in ${usedIn.map((project) => project.name).join(", ")} before deleting it.`);
    await unlink(join(backgroundDirectory, stored.storageName)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    await unlink(join(backgroundThumbnailDirectory, `${id}.jpg`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    backgroundRepository.remove(id);
  },
};

async function createBackgroundThumbnail(source: string, target: string, durationSeconds: number): Promise<void> {
  await mkdir(backgroundThumbnailDirectory, { recursive: true }); const seek = Math.max(0, Math.min(durationSeconds * .15, Math.max(0, durationSeconds - .1)));
  await execFileAsync("ffmpeg", ["-y", "-ss", seek.toFixed(3), "-i", source, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", target], { timeout: 60_000, windowsHide: true });
}

const mediaDirectory = join(dataDirectory, "media");
const mediaMimeTypes = new Map<string, { kind: ProjectMediaAssetRecord["kind"]; extension: string }>([
  ["image/png", { kind: "image", extension: ".png" }], ["image/jpeg", { kind: "image", extension: ".jpg" }], ["image/webp", { kind: "image", extension: ".webp" }],
  ["video/mp4", { kind: "video", extension: ".mp4" }], ["video/webm", { kind: "video", extension: ".webm" }], ["video/quicktime", { kind: "video", extension: ".mov" }],
  ["audio/wav", { kind: "audio", extension: ".wav" }], ["audio/mpeg", { kind: "audio", extension: ".mp3" }], ["audio/ogg", { kind: "audio", extension: ".ogg" }], ["audio/mp4", { kind: "audio", extension: ".m4a" }],
]);

export const mediaService = {
  list(): ProjectMediaAssetRecord[] { return mediaRepository.list(); },
  async create(input: CreateProjectMediaInput): Promise<ProjectMediaAssetRecord> {
    const name = input.name.trim().slice(0, 100); if (!name) throw new Error("Enter an asset name.");
    const details = mediaMimeTypes.get(input.file.mimeType); if (!details) throw new Error("Use a PNG, JPG, WebP, MP4, WebM, MOV, WAV, MP3, OGG, or M4A file.");
    if (!input.file.bytes.length || input.file.bytes.length > 500 * 1024 * 1024) throw new Error("Media files must be between 1 byte and 500 MB.");
    const width = details.kind === "audio" ? 0 : Math.max(0, Math.trunc(input.width)); const height = details.kind === "audio" ? 0 : Math.max(0, Math.trunc(input.height));
    const durationSeconds = details.kind === "image" ? 0 : Number(input.durationSeconds);
    if (details.kind !== "audio" && (!width || !height || width > 16384 || height > 16384)) throw new Error("Media dimensions are invalid.");
    if (details.kind !== "image" && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86_400)) throw new Error("Media duration is invalid.");
    await mkdir(mediaDirectory, { recursive: true }); const id = crypto.randomUUID(); const storageName = `${id}${details.extension}`; const target = join(mediaDirectory, storageName);
    await writeFile(target, input.file.bytes);
    try { return mediaRepository.create({ id, name, fileName: input.file.name, storageName, kind: details.kind, mimeType: input.file.mimeType,
      sizeBytes: input.file.bytes.length, width, height, durationSeconds: details.kind === "image" ? 0 : durationSeconds, createdAt: new Date().toISOString() }); }
    catch (error) { await unlink(target).catch(() => undefined); throw error; }
  },
  async importFile(input: { name: string; filePath: string; mimeType: string; width: number; height: number; durationSeconds: number }): Promise<ProjectMediaAssetRecord> {
    const bytes = new Uint8Array(await readFile(input.filePath)); return this.create({ name: input.name, width: input.width, height: input.height,
      durationSeconds: input.durationSeconds, file: { name: input.filePath.split(/[\\/]/).pop() || "media", mimeType: input.mimeType, bytes } });
  },
  file(id: string): { path: string; record: ProjectMediaAssetRecord } | undefined { const stored = mediaRepository.get(id); if (!stored) return undefined; const { storageName, ...record } = stored; return { path: join(mediaDirectory, storageName), record }; },
  async remove(id: string): Promise<void> {
    const stored = mediaRepository.get(id); if (!stored) return;
    if (projectService.list().some((project) => project.editorState.timeline.items.some((item) => item.assetId === id))) throw new Error("Remove this asset from every project timeline first.");
    await unlink(join(mediaDirectory, stored.storageName)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); mediaRepository.remove(id);
  },
};

const speechDirectory = join(dataDirectory, "audio", "tts");

export const speechService = {
  list(voiceId?: string): SpeechClipRecord[] {
    if (voiceId && !voiceRepository.get(voiceId)) throw new Error("Voice not found.");
    return speechRepository.list(voiceId);
  },
  async runtime(voiceId: string): Promise<SpeechRuntimeStatus> {
    const voice = voiceRepository.get(voiceId); if (!voice) throw new Error("Voice not found.");
    return { provider: voice.provider, execution: "remote", detail: `Runs on ${metadata[voice.provider].name}'s servers.`, estimate: "Usually seconds, but provider traffic can vary." };
  },
  async generate(input: GenerateSpeechInput): Promise<SpeechClipRecord> {
    const voice = voiceRepository.get(input.voiceId); if (!voice) throw new Error("Voice not found.");
    const text = input.text.trim(); if (!text) throw new Error("Enter text to generate speech.");
    if (text.length > 5_000) throw new Error("A dialogue line cannot exceed 5,000 characters.");
    if (!["slow", "normal", "fast"].includes(input.speed)) throw new Error("Choose a valid speech speed.");
    const generated = await providers[voice.provider].synthesize(keyFor(voice.provider), { voice, text, speed: input.speed, language: input.language });
    if (!generated.bytes.length || generated.bytes.length > 100 * 1024 * 1024) throw new Error("The TTS provider returned invalid audio.");
    await mkdir(speechDirectory, { recursive: true }); const id = crypto.randomUUID(); const storageName = `${id}${generated.extension}`; const target = join(speechDirectory, storageName);
    await writeFile(target, generated.bytes);
    try {
      const durationSeconds = await audioDuration(target);
      let words = generated.words; let timingSource: SpeechTimingSource = words.length ? "provider" : "estimated";
      const transcription = speechToTextSettings();
      if (transcription.provider === "faster-whisper" && whisperStatus().state === "ready") {
        try {
          const transcribed = await whisperWords(target, text, input.language, durationSeconds);
          if (transcribed?.length) { words = transcribed; timingSource = "whisper"; }
        } catch (error) {
          console.warn("Local Whisper subtitle generation failed; using the provider fallback.", error);
        }
      } else if (transcription.provider === "elevenlabs") {
        try {
          const transcribed = await elevenLabsWords(target, keyFor("elevenlabs")!, transcription.model, input.language);
          if (transcribed.length) { words = transcribed; timingSource = "elevenlabs"; }
        } catch (error) {
          console.warn("ElevenLabs speech-to-text failed; using the TTS timing fallback.", error);
        }
      }
      if (!words.length) words = approximateWords(text, durationSeconds);
      return speechRepository.create({ id, voiceId: voice.id, voiceName: voice.name, provider: voice.provider, providerVoiceId: voice.providerVoiceId,
        text, model: generated.model, speed: input.speed, storageName, mimeType: generated.mimeType, sizeBytes: generated.bytes.length,
        durationSeconds, words, timingSource, createdAt: new Date().toISOString() });
    } catch (error) { await unlink(target).catch(() => undefined); throw error; }
  },
  file(id: string): { path: string; record: SpeechClipRecord } | undefined {
    const stored = speechRepository.get(id); if (!stored) return undefined; const { storageName, ...record } = stored;
    return { path: join(speechDirectory, storageName), record };
  },
  async remove(id: string): Promise<void> {
    const stored = speechRepository.get(id); if (!stored) return;
    const usedIn = projectService.list().filter((project) => dialogueBlocks(project.editorState).some((line) => line.data.speechClipId === id));
    if (usedIn.length) throw new Error(`Regenerate or detach this speech in ${usedIn.map((project) => project.name).join(", ")} before deleting it.`);
    await unlink(join(speechDirectory, stored.storageName)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    speechRepository.remove(id);
  },
};

export const subtitleEngineService = {
  status(): SubtitleEngineStatus { return whisperStatus(); },
  install(): SubtitleEngineStatus { return startWhisperInstall(); },
};

async function audioDuration(path: string): Promise<number> {
  try { const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { timeout: 30_000 });
    const duration = Number(stdout.trim()); if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid duration."); return duration;
  } catch { throw new Error("Could not inspect generated audio. Install FFmpeg and ensure ffprobe is available."); }
}
function approximateWords(text: string, duration: number): SpeechWord[] {
  const tokens = text.match(/\S+/g) ?? []; const weights = tokens.map((token) => Math.max(1, token.replace(/[^\p{L}\p{N}]/gu, "").length)); const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0; return tokens.map((token, index) => { const startSeconds = cursor; cursor += duration * weights[index] / Math.max(1, total);
    return { text: token, type: "word", startSeconds, endSeconds: index === tokens.length - 1 ? duration : cursor }; });
}

function validateProjectName(value: string): string {
  const name = value.trim(); if (!name) throw new Error("Project name is required.");
  if (name.length > 100) throw new Error("Project name cannot exceed 100 characters."); return name;
}
function validateProjectDescription(value: string): string {
  const description = value.trim(); if (description.length > 500) throw new Error("Project description cannot exceed 500 characters."); return description;
}
function validateBackground(input: CreateBackgroundInput): { name: string; extension: string } {
  return validateBackgroundDetails({ name: input.name, videoName: input.video.name, mimeType: input.video.mimeType,
    sizeBytes: input.video.bytes.length, width: input.width, height: input.height, durationSeconds: input.durationSeconds });
}

function validateBackgroundDetails(input: { name: string; videoName: string; mimeType: string; sizeBytes: number; width: number; height: number; durationSeconds: number }): { name: string; extension: string } {
  const name = input.name.trim(); const extension = backgroundMimeTypes.get(input.mimeType) || extname(input.videoName).toLowerCase();
  if (!name) throw new Error("Background name is required.");
  if (name.length > 100) throw new Error("Background name cannot exceed 100 characters.");
  if (!backgroundMimeTypes.has(input.mimeType) || ![".mp4", ".webm", ".mov"].includes(extension)) throw new Error("Background videos must be MP4, WebM, or MOV files.");
  if (!input.sizeBytes) throw new Error("The selected video is empty.");
  if (input.sizeBytes > 500 * 1024 * 1024) throw new Error("Background videos must be 500 MB or smaller.");
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || input.width > 16384 || input.height > 16384)
    throw new Error("Video dimensions must be whole numbers between 1 and 16,384 pixels.");
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 86_400) throw new Error("The video duration could not be read.");
  return { name, extension };
}

function validateCharacterDetails(input: Pick<CreateCharacterInput, "name" | "voiceId">): string {
  const name = input.name.trim();
  if (!name) throw new Error("Character name is required.");
  if (name.length > 80) throw new Error("Character name cannot exceed 80 characters.");
  if (!voiceRepository.get(input.voiceId)) throw new Error("Choose a voice from the local voice library.");
  return name;
}

function validateCharacterImageDetails(image: Pick<CharacterImageUpload, "width" | "height">): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 4096 || image.height > 4096)
    throw new Error("Character image width and height must be whole numbers between 1 and 4,096 pixels.");
}

function validateNewCharacterImage(image: CharacterImageUpload): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)) throw new Error("Character images must be JPG, PNG, or WebP files.");
  if (!image.bytes.length || image.bytes.length > 10 * 1024 * 1024) throw new Error("Each character image must be between 1 byte and 10 MB.");
  validateCharacterImageDetails(image);
}
