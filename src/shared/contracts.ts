export type ProviderId = "elevenlabs" | "minimax" | "fish";
export type VoiceKind = "existing" | "cloned" | "generated";
export type StorageSecurity = "encrypted" | "session-only" | "local-only";
export type ProviderCapability = "existing" | "clone" | "design";
export type LocalModelState = "not-installed" | "downloading" | "ready" | "error";
export type TextToSpeechSpeed = "slow" | "normal" | "fast";
export type SpeechTimingSource = "whisper" | "elevenlabs" | "provider" | "estimated";
export type SpeechToTextProviderId = "faster-whisper" | "elevenlabs";
export type ElevenLabsSpeechToTextModel = "scribe_v2" | "scribe_v1";
export type ProjectEditSource = "ui" | "mcp" | "system";
export type ProjectType = "dialogue" | "reddit-story" | "fake-text";

export type CaptionPresetId =
  | "dialogue-bold" | "classic" | "minimal" | "karaoke"
  | "dl-default" | "dl-tiktok-pop" | "dl-cinematic-serif" | "dl-boxed-highlighter" | "dl-comic-punch"
  | "dl-cyberpunk-grid" | "dl-soft-rounded" | "dl-card-highlight" | "dl-hard-outline" | "dl-pastel-duo"
  | "dl-mono-terminal" | "dl-vintage-film" | "dl-bubble-gum" | "dl-handwritten-notes" | "dl-wide-impact"
  | "dl-clean-minimal" | "dl-upper-third" | "dl-caption-bar" | "dl-contrast-drop" | "dl-headline-condensed" | "dl-retro-pixel"
  | "fsp-classic"
  | "hf-block-pop" | "hf-cobalt-chip" | "hf-broadside" | "hf-capsule" | "hf-editorial" | "hf-code-underline"
  | "custom";
export type CaptionFontFamily = string;

export interface ProjectCaptionStyle {
  presetId: CaptionPresetId;
  fontFamily: CaptionFontFamily;
  fontSizePx: number;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  textColor: string;
  activeWordColor: string;
  activeWordTextColor: string;
  activeWordEmphasis: "text" | "highlight" | "underline";
  activeWordRadiusPx: number;
  activeWordScale: number;
  inactiveWordOpacity: number;
  wordGapEm: number;
  strokeColor: string;
  strokeWidthPx: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlurPx: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowOpacity: number;
  position: "top" | "middle" | "bottom";
  edgeOffsetPercent: number;
  maxWidthPercent: number;
  alignment: "left" | "center" | "right";
  wordsPerPage: number;
  switchCaptionsEveryMs: number;
  verticalPositionPx: number;
  lineHeight: number;
  surfaceEnabled: boolean;
  surfaceColor: string;
  surfaceOpacity: number;
  surfacePaddingX: number;
  surfacePaddingY: number;
  surfaceBorderColor: string;
  surfaceBorderWidthPx: number;
  surfaceBorderRadiusPx: number;
  surfaceShadowColor: string;
  surfaceShadowOffsetX: number;
  surfaceShadowOffsetY: number;
  surfaceShadowBlurPx: number;
  surfaceShadowOpacity: number;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  configured: boolean;
  keyHint?: string;
  security: StorageSecurity;
  docsUrl: string;
  description: string;
  capabilities: ProviderCapability[];
}

export interface VoiceRecord {
  id: string;
  provider: ProviderId;
  providerVoiceId: string;
  name: string;
  description: string;
  kind: VoiceKind;
  previewUrl?: string;
  imageUrl?: string;
  createdAt: string;
  requiresActivation?: boolean;
  providerCategory?: string;
}

export interface ImageUpload {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CharacterImageUpload extends ImageUpload {
  label: string;
  width: number;
  height: number;
}

export interface CharacterImageRecord {
  id: string;
  label: string;
  width: number;
  height: number;
  imageUrl: string;
}

export interface CharacterRecord {
  id: string;
  name: string;
  description: string;
  voiceId: string;
  voiceName: string;
  voiceProvider: ProviderId;
  images: CharacterImageRecord[];
  createdAt: string;
}

export interface CreateCharacterInput {
  name: string;
  description: string;
  voiceId: string;
  images: CharacterImageUpload[];
}

export interface VideoUpload {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface BackgroundRecord {
  id: string;
  name: string;
  description: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface CreateBackgroundInput {
  name: string;
  description: string;
  video: VideoUpload;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface UpdateBackgroundInput {
  localBackgroundId: string;
  name: string;
  description: string;
}

export interface LocalFontRecord {
  id: string;
  family: string;
  fileName: string;
  mimeType: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
  source: "bundled" | "imported";
  fontUrl: string;
  createdAt: string;
}

export interface ImportFontInput {
  family: string;
  file: ImageUpload;
}

export interface SpeechWord {
  text: string;
  type: "word" | "spacing" | "punctuation";
  startSeconds: number;
  endSeconds: number;
}

export interface DialogueWordAnchor {
  wordIndex: number;
  exact: string;
  occurrence: number;
  prefix: string;
  suffix: string;
}

export interface DialoguePerformanceCue {
  id: string;
  characterImageId: string;
  at: DialogueWordAnchor;
}

export interface SpeechClipRecord {
  id: string;
  voiceId?: string;
  voiceName: string;
  provider: ProviderId;
  providerVoiceId: string;
  text: string;
  model: string;
  speed: TextToSpeechSpeed;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  words: SpeechWord[];
  timingSource: SpeechTimingSource;
  audioUrl: string;
  createdAt: string;
}

export interface SpeechRuntimeStatus {
  provider: ProviderId;
  execution: "remote";
  detail: string;
  estimate: string;
}

export interface SubtitleEngineStatus {
  state: LocalModelState;
  engine: "faster-whisper";
  model: string;
  runtimePath: string;
  modelPath: string;
  error?: string;
}

export interface SpeechToTextConfiguration {
  selected: SpeechToTextProviderId;
  elevenLabsModel: ElevenLabsSpeechToTextModel;
  providers: Array<{
    id: SpeechToTextProviderId;
    name: string;
    description: string;
    configured: boolean;
    keyHint?: string;
    localStatus?: SubtitleEngineStatus;
  }>;
}

export interface GenerateSpeechInput {
  voiceId: string;
  text: string;
  speed: TextToSpeechSpeed;
  language?: string;
}

export interface ProjectBlock {
  id: string;
  kind: string;
  order: number;
  data: Record<string, unknown>;
  timeline?: ProjectBlockTimeline;
}

export type ProjectTimelineMode = "flow" | "manual";

export interface ProjectBlockTimeline {
  startSeconds: number;
  durationSeconds: number;
  sourceStartSeconds: number;
  linkGroupId: string;
  locked: boolean;
  transform?: ProjectElementTransform;
  motion?: ProjectClipMotion;
  roleOverrides?: Partial<Record<DialogueTimelineRole, ProjectTimelineWindow>>;
}

export type DialogueTimelineRole = "character" | "speech" | "captions";
export type ProjectTrackKind = "visual" | "audio" | "captions";
export type ProjectAuthoredItemKind = "image" | "video" | "audio" | "text" | "character-pose";

export type ProjectMotionPreset =
  | "none" | "fade" | "slide" | "pop" | "scale" | "rise" | "drop" | "zoom" | "spin" | "pulse"
  | "fadeIn" | "slideInLeft" | "slideInRight" | "slideInUp" | "slideInDown" | "grow" | "zoomIn" | "swooshIn" | "magnetIn"
  | "fadeOut" | "slideOutLeft" | "slideOutRight" | "slideOutUp" | "slideOutDown" | "shrinkOut" | "zoomOut" | "swooshOut" | "magnetOut"
  | "float" | "drift" | "breathe" | "sway" | "shake" | "handheld"
  | "smoothGlitchZoomIn" | "smoothGlitchZoomOut" | "smoothGlitchIntenseZoomIn" | "smoothGlitchIntenseZoomOut" | "dramaticZoomIn" | "dramaticZoomOut";
export type ProjectMotionDirection = "left" | "right" | "up" | "down";
export type ProjectMotionEasing = "smooth" | "snappy" | "gentle";
export type ProjectSceneTransitionPreset = "cut" | "fade" | "crossfade" | "slide" | "zoom";
export type ProjectCaptionAnimationPreset = "none" | "pop" | "word-reveal" | "karaoke" | "bounce";

export interface ProjectMotionConfig {
  preset: ProjectMotionPreset;
  durationSeconds: number;
  easing: ProjectMotionEasing;
  direction: ProjectMotionDirection;
}

export interface ProjectClipMotion {
  entrance: ProjectMotionConfig;
  during: ProjectMotionConfig;
  exit: ProjectMotionConfig;
  combo?: ProjectMotionConfig;
}

export interface ProjectSceneTransition {
  preset: ProjectSceneTransitionPreset;
  durationSeconds: number;
  direction: ProjectMotionDirection;
}

export interface ProjectCaptionAnimation {
  preset: ProjectCaptionAnimationPreset;
  durationSeconds: number;
}

export interface ProjectElementTransform {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  rotationDegrees: number;
  opacity: number;
  zIndex: number;
}

export interface ProjectTimelineWindow {
  startSeconds: number;
  durationSeconds: number;
  sourceStartSeconds: number;
  trackId: string;
  locked: boolean;
}

export interface ProjectAuthoredTrack {
  id: string;
  name: string;
  kind: ProjectTrackKind;
  order: number;
  locked: boolean;
  hidden: boolean;
  system: boolean;
}

export interface ProjectAuthoredTimelineItem extends ProjectTimelineWindow {
  id: string;
  kind: ProjectAuthoredItemKind;
  assetId?: string;
  characterId?: string;
  characterImageId?: string;
  text?: string;
  transform: ProjectElementTransform;
  motion: ProjectClipMotion;
  transition: ProjectSceneTransition;
  volume: number;
  playbackRate: number;
  muted: boolean;
  loop: boolean;
  hidden: boolean;
}

export interface ProjectAuthoredTimeline {
  mode: ProjectTimelineMode;
  tracks: ProjectAuthoredTrack[];
  items: ProjectAuthoredTimelineItem[];
}

export interface ProjectMediaAssetRecord {
  id: string;
  name: string;
  fileName: string;
  kind: Exclude<ProjectAuthoredItemKind, "text" | "character-pose">;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  mediaUrl: string;
  createdAt: string;
}

export interface CreateProjectMediaInput {
  name: string;
  file: ImageUpload;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface DialogueLineData {
  [key: string]: unknown;
  characterId: string;
  characterImageId: string;
  text: string;
  position: "left" | "center" | "right";
  speechSpeed: TextToSpeechSpeed;
  speechClipId?: string;
  captionWordsOverride?: SpeechWord[];
  performanceCues?: DialoguePerformanceCue[];
  gapAfterSeconds: number;
  hideSubtitles: boolean;
  narratorVoiceId?: string;
  redditPost?: RedditPostData;
}

export interface RedditPostData {
  sourceUrl: string;
  subreddit: string;
  username: string;
  postedAgo: string;
  title: string;
  upvotes: string;
  comments: string;
}

export interface FakeTextMessageData {
  [key: string]: unknown;
  side: "incoming" | "outgoing";
  text: string;
  sender: string;
}

export interface FakeTextSettings {
  staggerSeconds: number;
  holdSeconds: number;
  senderName: string;
  contactName: string;
  phoneTheme: "light" | "dark";
  phoneScalePercent: number;
  gameplayDimPercent: number;
  unreadCount: number;
  showHeader: boolean;
  incomingBubbleColor: string;
  incomingTextColor: string;
  outgoingBubbleColor: string;
  outgoingTextColor: string;
  backgroundTopColor: string;
  backgroundBottomColor: string;
  showSenders: boolean;
  showTypingIndicator: boolean;
}

export interface ProjectTimelineClip {
  id: string;
  groupId?: string;
  kind: string;
  startSeconds: number;
  durationSeconds: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectTrack {
  id: string;
  name: string;
  kind: string;
  clips: ProjectTimelineClip[];
}

export interface ProjectEditorState {
  schemaVersion: number;
  projectType: ProjectType;
  fakeText?: FakeTextSettings;
  canvas: { width: number; height: number; fps: number };
  assets: { backgroundId?: string; backgroundStartSeconds: number; characterIds: string[] };
  captions: ProjectCaptionStyle;
  captionAnimation: ProjectCaptionAnimation;
  timeline: ProjectAuthoredTimeline;
  blocks: ProjectBlock[];
  scenes: Array<Record<string, unknown>>;
  tracks: ProjectTrack[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  editorState: ProjectEditorState;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  projectType?: ProjectType;
  width: number;
  height: number;
  fps: number;
}

export interface UpdateProjectInput {
  localProjectId: string;
  name?: string;
  description?: string;
  editorState?: ProjectEditorState;
  expectedRevision?: number;
}

export type ProjectCommand =
  | { kind: "configure-stage"; backgroundId?: string; backgroundStartSeconds?: number; characterIds?: string[] }
  | { kind: "add-fake-text-message"; message?: Partial<FakeTextMessageData>; afterMessageId?: string }
  | { kind: "update-fake-text-message"; messageId: string; patch: Partial<FakeTextMessageData> }
  | { kind: "duplicate-fake-text-message"; messageId: string }
  | { kind: "remove-fake-text-message"; messageId: string }
  | { kind: "reorder-fake-text-messages"; messageIds: string[] }
  | { kind: "set-fake-text-settings"; patch: Partial<FakeTextSettings> }
  | { kind: "add-dialogue-line"; line?: Partial<DialogueLineData>; afterLineId?: string }
  | { kind: "update-dialogue-line"; lineId: string; patch: Partial<DialogueLineData> }
  | { kind: "set-dialogue-caption-words"; lineId: string; words: SpeechWord[] | null }
  | { kind: "set-dialogue-performance-cues"; lineId: string; cues: DialoguePerformanceCue[] }
  | { kind: "duplicate-dialogue-line"; lineId: string }
  | { kind: "remove-dialogue-line"; lineId: string }
  | { kind: "reorder-dialogue-lines"; lineIds: string[] }
  | { kind: "set-dialogue-gap"; lineId: string; gapAfterSeconds: number }
  | { kind: "set-timeline-mode"; mode: ProjectTimelineMode }
  | { kind: "set-dialogue-timings"; edits: Array<{ lineId: string; startSeconds: number; durationSeconds?: number; sourceStartSeconds?: number }> }
  | { kind: "set-dialogue-role-linked"; lineId: string; role: DialogueTimelineRole; linked: boolean }
  | { kind: "set-dialogue-role-timings"; edits: Array<{ lineId: string; role: DialogueTimelineRole; startSeconds: number; durationSeconds?: number; sourceStartSeconds?: number; trackId?: string }> }
  | { kind: "set-block-transform"; blockId: string; transform: Partial<ProjectElementTransform> }
  | { kind: "set-block-motion"; blockId: string; motion: Partial<{ entrance: Partial<ProjectMotionConfig>; during: Partial<ProjectMotionConfig>; exit: Partial<ProjectMotionConfig>; combo: Partial<ProjectMotionConfig> }> }
  | { kind: "set-caption-animation"; patch: Partial<ProjectCaptionAnimation> }
  | { kind: "add-project-track"; name: string; trackKind: ProjectTrackKind }
  | { kind: "update-project-track"; trackId: string; patch: Partial<Pick<ProjectAuthoredTrack, "name" | "locked" | "hidden">> }
  | { kind: "remove-project-track"; trackId: string }
  | { kind: "reorder-project-tracks"; trackIds: string[] }
  | { kind: "add-timeline-item"; item: Omit<Partial<ProjectAuthoredTimelineItem>, "transform" | "motion" | "transition"> & Pick<ProjectAuthoredTimelineItem, "kind" | "trackId"> & { transform?: Partial<ProjectElementTransform>; motion?: Partial<{ entrance: Partial<ProjectMotionConfig>; during: Partial<ProjectMotionConfig>; exit: Partial<ProjectMotionConfig>; combo: Partial<ProjectMotionConfig> }>; transition?: Partial<ProjectSceneTransition> } }
  | { kind: "update-timeline-items"; edits: Array<{ itemId: string; patch: Omit<Partial<ProjectAuthoredTimelineItem>, "id" | "kind" | "transform" | "motion" | "transition"> & { transform?: Partial<ProjectElementTransform>; motion?: Partial<{ entrance: Partial<ProjectMotionConfig>; during: Partial<ProjectMotionConfig>; exit: Partial<ProjectMotionConfig>; combo: Partial<ProjectMotionConfig> }>; transition?: Partial<ProjectSceneTransition> } }> }
  | { kind: "split-timeline-item"; itemId: string; atSeconds: number }
  | { kind: "remove-timeline-items"; itemIds: string[] }
  | { kind: "set-caption-style"; patch: Partial<ProjectCaptionStyle> }
  | { kind: "replace-editor-state"; editorState: ProjectEditorState };

export interface ProjectHistoryEntry {
  sequence: number;
  revision: number;
  source: ProjectEditSource;
  commandKind: string;
  summary: string;
  createdAt: string;
  current: boolean;
}

export interface ProjectValidationIssue {
  code: string;
  message: string;
  severity: "warning" | "error";
  lineId?: string;
}

export interface ProjectCommandResult {
  project: ProjectRecord;
  revision: number;
  timeline: import("./project-timeline").CompiledDialogueTimeline;
  canUndo: boolean;
  canRedo: boolean;
  validationIssues: ProjectValidationIssue[];
}

export interface ApplyProjectCommandsInput {
  localProjectId: string;
  commands: ProjectCommand[];
  source?: ProjectEditSource;
  expectedRevision?: number;
  summary?: string;
}

export type RenderQuality = "draft" | "standard" | "high";

export interface ProjectRenderRecord {
  id: string;
  projectId: string;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number;
  quality: RenderQuality;
  videoUrl: string;
  createdAt: string;
}

export type ProjectRenderJobStatus = "queued" | "preparing" | "rendering" | "complete" | "failed" | "cancelled";

export interface ProjectRenderJobRecord {
  id: string;
  projectId: string;
  projectName: string;
  projectRevision: number;
  status: ProjectRenderJobStatus;
  progress: number;
  stage: string;
  quality: RenderQuality;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number;
  videoUrl?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface UpdateCharacterInput {
  localCharacterId: string;
  name: string;
  description: string;
  voiceId: string;
  existingImages: Array<Pick<CharacterImageRecord, "id" | "label" | "width" | "height">>;
  newImages: CharacterImageUpload[];
}

export interface UpdateVoiceInput {
  localVoiceId: string;
  name?: string;
  image?: ImageUpload;
}

export interface RemoteVoice {
  provider: ProviderId;
  providerVoiceId: string;
  name: string;
  description: string;
  previewUrl?: string;
  category?: string;
}

export interface AudioUpload {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CloneVoiceInput {
  provider: ProviderId;
  name: string;
  description: string;
  audio: AudioUpload;
  removeBackgroundNoise: boolean;
  previewText?: string;
}

export interface DesignVoiceInput {
  provider: ProviderId;
  prompt: string;
  previewText: string;
}

export interface DesignPreview {
  id: string;
  provider: ProviderId;
  audioUrl: string;
  generatedVoiceId: string;
  expiresAt?: string;
}

export interface SaveDesignInput {
  provider: ProviderId;
  preview: DesignPreview;
  name: string;
  description: string;
}

export interface LinkVoiceInput {
  voice: RemoteVoice;
}

export interface DialogueApi {
  projects: {
    list(): Promise<ProjectRecord[]>;
    get(localProjectId: string): Promise<ProjectRecord>;
    create(input: CreateProjectInput): Promise<ProjectRecord>;
    update(input: UpdateProjectInput): Promise<ProjectRecord>;
    timeline(localProjectId: string): Promise<ProjectCommandResult>;
    commands(input: ApplyProjectCommandsInput): Promise<ProjectCommandResult>;
    history(localProjectId: string, limit?: number): Promise<ProjectHistoryEntry[]>;
    undo(localProjectId: string, expectedRevision?: number): Promise<ProjectCommandResult>;
    redo(localProjectId: string, expectedRevision?: number): Promise<ProjectCommandResult>;
    remove(localProjectId: string): Promise<void>;
    render(localProjectId: string, quality?: RenderQuality): Promise<ProjectRenderJobRecord>;
    renders(localProjectId: string): Promise<ProjectRenderJobRecord[]>;
    cancelRender(renderId: string): Promise<ProjectRenderJobRecord>;
    retryRender(renderId: string): Promise<ProjectRenderJobRecord>;
    removeRender(renderId: string): Promise<void>;
  };
  providers: {
    status(): Promise<ProviderStatus[]>;
    configure(provider: ProviderId, apiKey: string): Promise<ProviderStatus[]>;
    disconnect(provider: ProviderId): Promise<ProviderStatus[]>;
    speechToText(): Promise<SpeechToTextConfiguration>;
    configureSpeechToText(provider: SpeechToTextProviderId, model?: ElevenLabsSpeechToTextModel): Promise<SpeechToTextConfiguration>;
  };
  voices: {
    list(): Promise<VoiceRecord[]>;
    listRemote(provider: ProviderId): Promise<RemoteVoice[]>;
    link(input: LinkVoiceInput): Promise<VoiceRecord>;
    clone(input: CloneVoiceInput): Promise<VoiceRecord>;
    design(input: DesignVoiceInput): Promise<DesignPreview[]>;
    saveDesign(input: SaveDesignInput): Promise<VoiceRecord>;
    update(input: UpdateVoiceInput): Promise<VoiceRecord>;
    remove(localVoiceId: string): Promise<void>;
  };
  characters: {
    list(): Promise<CharacterRecord[]>;
    create(input: CreateCharacterInput): Promise<CharacterRecord>;
    update(input: UpdateCharacterInput): Promise<CharacterRecord>;
    remove(localCharacterId: string): Promise<void>;
  };
  backgrounds: {
    list(): Promise<BackgroundRecord[]>;
    create(input: CreateBackgroundInput): Promise<BackgroundRecord>;
    update(input: UpdateBackgroundInput): Promise<BackgroundRecord>;
    remove(localBackgroundId: string): Promise<void>;
  };
  fonts: {
    list(): Promise<LocalFontRecord[]>;
    import(input: ImportFontInput): Promise<LocalFontRecord>;
    remove(localFontId: string): Promise<void>;
  };
  media: {
    list(): Promise<ProjectMediaAssetRecord[]>;
    create(input: CreateProjectMediaInput): Promise<ProjectMediaAssetRecord>;
    remove(localMediaId: string): Promise<void>;
  };
  speech: {
    list(voiceId?: string): Promise<SpeechClipRecord[]>;
    runtime(voiceId: string): Promise<SpeechRuntimeStatus>;
    subtitleStatus(): Promise<SubtitleEngineStatus>;
    installSubtitles(): Promise<SubtitleEngineStatus>;
    generate(input: GenerateSpeechInput): Promise<SpeechClipRecord>;
    remove(localSpeechId: string): Promise<void>;
  };
}
