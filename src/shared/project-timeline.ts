import type {
  DialogueLineData, DialoguePerformanceCue, DialogueTimelineRole, FakeTextMessageData, FakeTextSettings, ProjectAuthoredTimelineItem, ProjectAuthoredTrack, ProjectBlock, ProjectBlockTimeline,
  ProjectCaptionStyle, ProjectClipMotion, ProjectEditorState, ProjectElementTransform, ProjectMotionConfig, ProjectSceneTransition, ProjectTimelineClip, ProjectTimelineWindow, ProjectTrack, SpeechClipRecord, SpeechWord,
} from "./contracts";

export const PROJECT_STATE_VERSION = 14;

export const FAKE_TEXT_FIRST_MESSAGE_SECONDS = .65;

export const DEFAULT_FAKE_TEXT_SETTINGS: FakeTextSettings = {
  staggerSeconds: .86,
  holdSeconds: 1.2,
  senderName: "Jake",
  contactName: "Jessica",
  phoneTheme: "light",
  phoneScalePercent: 90,
  gameplayDimPercent: 0,
  unreadCount: 92,
  showHeader: true,
  incomingBubbleColor: "#E9E9EB",
  incomingTextColor: "#000000",
  outgoingBubbleColor: "#0B84FF",
  outgoingTextColor: "#FFFFFF",
  backgroundTopColor: "#E8A86A",
  backgroundBottomColor: "#2E416A",
  showSenders: false,
  showTypingIndicator: false,
};

export const DEFAULT_CAPTION_STYLE: ProjectCaptionStyle = {
  presetId: "dialogue-bold", fontFamily: "Inter", fontSizePx: 72, fontWeight: 900, textTransform: "none",
  textColor: "#FFFFFF", activeWordColor: "#B9FF39", activeWordTextColor: "#FFFFFF", activeWordEmphasis: "text", activeWordRadiusPx: 8, activeWordScale: 1, inactiveWordOpacity: .72, wordGapEm: .16,
  strokeColor: "#000000", strokeWidthPx: 8,
  shadowEnabled: true, shadowColor: "#000000", shadowBlurPx: 8, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 0.9,
  position: "middle", edgeOffsetPercent: 7, maxWidthPercent: 86, alignment: "center", wordsPerPage: 4, switchCaptionsEveryMs: 1200, verticalPositionPx: 960, lineHeight: 1.08,
  surfaceEnabled: false, surfaceColor: "#FFFFFF", surfaceOpacity: 1, surfacePaddingX: 32, surfacePaddingY: 18,
  surfaceBorderColor: "#000000", surfaceBorderWidthPx: 0, surfaceBorderRadiusPx: 0,
  surfaceShadowColor: "#000000", surfaceShadowOffsetX: 0, surfaceShadowOffsetY: 0, surfaceShadowBlurPx: 0, surfaceShadowOpacity: 0,
};

export const DEFAULT_PROJECT_TRANSFORM: ProjectElementTransform = {
  xPercent: 50, yPercent: 50, widthPercent: 50, heightPercent: 50, rotationDegrees: 0, opacity: 1, zIndex: 3,
};

export function defaultDialogueCharacterTransform(position: DialogueLineData["position"] = "center"): ProjectElementTransform {
  return { ...DEFAULT_PROJECT_TRANSFORM, xPercent: position === "left" ? 25 : position === "right" ? 75 : 50, yPercent: 80, widthPercent: 68, heightPercent: 37.5 };
}

export const DEFAULT_MOTION_CONFIG: ProjectMotionConfig = { preset: "none", durationSeconds: .35, easing: "smooth", direction: "up" };
export const DEFAULT_PROJECT_MOTION: ProjectClipMotion = { entrance: DEFAULT_MOTION_CONFIG, during: DEFAULT_MOTION_CONFIG, exit: DEFAULT_MOTION_CONFIG, combo: DEFAULT_MOTION_CONFIG };

export const PROJECT_MOTION_PRESETS: ProjectMotionConfig["preset"][] = [
  "none", "fade", "slide", "pop", "scale", "rise", "drop", "zoom", "spin", "pulse",
  "fadeIn", "slideInLeft", "slideInRight", "slideInUp", "slideInDown", "grow", "zoomIn", "swooshIn", "magnetIn",
  "fadeOut", "slideOutLeft", "slideOutRight", "slideOutUp", "slideOutDown", "shrinkOut", "zoomOut", "swooshOut", "magnetOut",
  "float", "drift", "breathe", "sway", "shake", "handheld",
  "smoothGlitchZoomIn", "smoothGlitchZoomOut", "smoothGlitchIntenseZoomIn", "smoothGlitchIntenseZoomOut", "dramaticZoomIn", "dramaticZoomOut",
];
export const DEFAULT_SCENE_TRANSITION: ProjectSceneTransition = { preset: "cut", durationSeconds: .4, direction: "left" };

export const DEFAULT_PROJECT_TRACKS: ProjectAuthoredTrack[] = [
  { id: "characters", name: "Characters", kind: "visual", order: 0, locked: false, hidden: false, system: true },
  { id: "captions", name: "Captions", kind: "captions", order: 1, locked: false, hidden: false, system: true },
  { id: "overlays", name: "Overlays", kind: "visual", order: 2, locked: false, hidden: false, system: true },
  { id: "speech", name: "Speech", kind: "audio", order: 3, locked: false, hidden: false, system: true },
  { id: "audio", name: "Audio", kind: "audio", order: 4, locked: false, hidden: false, system: true },
];

function originalDialogueLabPreset(
  presetId: Exclude<ProjectCaptionStyle["presetId"], "custom">,
  config: {
    fontFamily: string; fontSizePx: number; fontWeight: ProjectCaptionStyle["fontWeight"];
    textColor: string; activeWordColor: string; strokeWidthPx: number; strokeColor: string;
    shadowEnabled: boolean; shadowOffsetX: number; shadowOffsetY: number; shadowBlurPx: number; shadowColor: string; shadowOpacity: number;
    switchCaptionsEveryMs: number; verticalPositionPx: number; behavior: "default" | "colored" | "scaling" | "highlight";
  },
): ProjectCaptionStyle {
  return {
    ...DEFAULT_CAPTION_STYLE,
    presetId,
    fontFamily: config.fontFamily,
    fontSizePx: config.fontSizePx,
    fontWeight: config.fontWeight,
    textTransform: "uppercase",
    textColor: config.textColor,
    activeWordColor: config.activeWordColor,
    activeWordTextColor: config.behavior === "highlight" ? config.textColor : config.activeWordColor,
    activeWordEmphasis: config.behavior === "highlight" ? "highlight" : "text",
    activeWordRadiusPx: config.behavior === "highlight" ? 8 : 0,
    activeWordScale: config.behavior === "scaling" ? 1.2 : 1,
    inactiveWordOpacity: 1,
    wordGapEm: .12,
    strokeWidthPx: config.strokeWidthPx,
    strokeColor: config.strokeColor,
    shadowEnabled: config.shadowEnabled,
    shadowOffsetX: config.shadowOffsetX,
    shadowOffsetY: config.shadowOffsetY,
    shadowBlurPx: config.shadowBlurPx,
    shadowColor: config.shadowColor,
    shadowOpacity: config.shadowOpacity,
    wordsPerPage: 8,
    switchCaptionsEveryMs: config.switchCaptionsEveryMs,
    verticalPositionPx: config.verticalPositionPx,
    lineHeight: 1,
    surfaceEnabled: false,
  };
}

export const CAPTION_PRESETS: Record<Exclude<ProjectCaptionStyle["presetId"], "custom">, ProjectCaptionStyle> = {
  "dialogue-bold": DEFAULT_CAPTION_STYLE,
  classic: { ...DEFAULT_CAPTION_STYLE, presetId: "classic", fontWeight: 700, activeWordColor: "#FFFFFF", inactiveWordOpacity: .82, shadowBlurPx: 4 },
  minimal: { ...DEFAULT_CAPTION_STYLE, presetId: "minimal", fontWeight: 500, strokeWidthPx: 0, activeWordColor: "#FFFFFF", inactiveWordOpacity: .55, shadowBlurPx: 12, shadowOffsetY: 5 },
  karaoke: { ...DEFAULT_CAPTION_STYLE, presetId: "karaoke", fontWeight: 800, activeWordColor: "#A78BFA", activeWordTextColor: "#FFFFFF", activeWordEmphasis: "highlight", activeWordRadiusPx: 10, inactiveWordOpacity: .45, wordsPerPage: 3, strokeWidthPx: 5 },
  "dl-default": originalDialogueLabPreset("dl-default", { fontFamily: "Titan One", fontSizePx: 120, fontWeight: 400, textColor: "#FFFFFF", activeWordColor: "#39E508", strokeWidthPx: 20, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 2, shadowOffsetY: 4, shadowBlurPx: 6, shadowColor: "#000000", shadowOpacity: .3, switchCaptionsEveryMs: 800, verticalPositionPx: 860, behavior: "default" }),
  "dl-tiktok-pop": originalDialogueLabPreset("dl-tiktok-pop", { fontFamily: "Bebas Neue", fontSizePx: 120, fontWeight: 700, textColor: "#FFFFFF", activeWordColor: "#FF3B5C", strokeWidthPx: 8, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 6, shadowBlurPx: 12, shadowColor: "#000000", shadowOpacity: .35, switchCaptionsEveryMs: 520, verticalPositionPx: 860, behavior: "scaling" }),
  "dl-cinematic-serif": originalDialogueLabPreset("dl-cinematic-serif", { fontFamily: "DM Serif Display", fontSizePx: 90, fontWeight: 400, textColor: "#F5F7FA", activeWordColor: "#FFD166", strokeWidthPx: 3, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 3, shadowBlurPx: 10, shadowColor: "#000000", shadowOpacity: .4, switchCaptionsEveryMs: 900, verticalPositionPx: 980, behavior: "default" }),
  "dl-boxed-highlighter": originalDialogueLabPreset("dl-boxed-highlighter", { fontFamily: "Inter", fontSizePx: 96, fontWeight: 800, textColor: "#111827", activeWordColor: "#FDE047", strokeWidthPx: 2, strokeColor: "#FFFFFF", shadowEnabled: false, shadowOffsetX: 0, shadowOffsetY: 2, shadowBlurPx: 4, shadowColor: "#000000", shadowOpacity: .15, switchCaptionsEveryMs: 600, verticalPositionPx: 860, behavior: "highlight" }),
  "dl-comic-punch": originalDialogueLabPreset("dl-comic-punch", { fontFamily: "Luckiest Guy", fontSizePx: 110, fontWeight: 400, textColor: "#FFF100", activeWordColor: "#FF006E", strokeWidthPx: 10, strokeColor: "#000000", shadowEnabled: false, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlurPx: 0, shadowColor: "#000000", shadowOpacity: 0, switchCaptionsEveryMs: 700, verticalPositionPx: 860, behavior: "colored" }),
  "dl-cyberpunk-grid": originalDialogueLabPreset("dl-cyberpunk-grid", { fontFamily: "Teko", fontSizePx: 108, fontWeight: 700, textColor: "#00E5FF", activeWordColor: "#FF00A8", strokeWidthPx: 5, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlurPx: 18, shadowColor: "#00E5FF", shadowOpacity: .7, switchCaptionsEveryMs: 650, verticalPositionPx: 860, behavior: "colored" }),
  "dl-soft-rounded": originalDialogueLabPreset("dl-soft-rounded", { fontFamily: "Nunito", fontSizePx: 96, fontWeight: 700, textColor: "#FFFFFF", activeWordColor: "#22D3EE", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 4, shadowBlurPx: 10, shadowColor: "#000000", shadowOpacity: .45, switchCaptionsEveryMs: 600, verticalPositionPx: 860, behavior: "default" }),
  "dl-card-highlight": originalDialogueLabPreset("dl-card-highlight", { fontFamily: "Poppins", fontSizePx: 92, fontWeight: 600, textColor: "#1F2937", activeWordColor: "#A7F3D0", strokeWidthPx: 2, strokeColor: "#FFFFFF", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 2, shadowBlurPx: 4, shadowColor: "#000000", shadowOpacity: .15, switchCaptionsEveryMs: 520, verticalPositionPx: 860, behavior: "highlight" }),
  "dl-hard-outline": originalDialogueLabPreset("dl-hard-outline", { fontFamily: "Anton", fontSizePx: 118, fontWeight: 700, textColor: "#FFFFFF", activeWordColor: "#FFB703", strokeWidthPx: 12, strokeColor: "#000000", shadowEnabled: false, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlurPx: 0, shadowColor: "#000000", shadowOpacity: 0, switchCaptionsEveryMs: 600, verticalPositionPx: 860, behavior: "scaling" }),
  "dl-pastel-duo": originalDialogueLabPreset("dl-pastel-duo", { fontFamily: "Montserrat", fontSizePx: 98, fontWeight: 700, textColor: "#FAFAFA", activeWordColor: "#A78BFA", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 3, shadowBlurPx: 8, shadowColor: "#000000", shadowOpacity: .35, switchCaptionsEveryMs: 550, verticalPositionPx: 860, behavior: "colored" }),
  "dl-mono-terminal": originalDialogueLabPreset("dl-mono-terminal", { fontFamily: "IBM Plex Mono", fontSizePx: 88, fontWeight: 600, textColor: "#D1FAE5", activeWordColor: "#34D399", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlurPx: 16, shadowColor: "#10B981", shadowOpacity: .6, switchCaptionsEveryMs: 700, verticalPositionPx: 860, behavior: "default" }),
  "dl-vintage-film": originalDialogueLabPreset("dl-vintage-film", { fontFamily: "Playfair Display", fontSizePx: 86, fontWeight: 600, textColor: "#F5ECD7", activeWordColor: "#B08968", strokeWidthPx: 3, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 2, shadowBlurPx: 6, shadowColor: "#000000", shadowOpacity: .5, switchCaptionsEveryMs: 900, verticalPositionPx: 860, behavior: "default" }),
  "dl-bubble-gum": originalDialogueLabPreset("dl-bubble-gum", { fontFamily: "Lilita One", fontSizePx: 112, fontWeight: 400, textColor: "#FFFFFF", activeWordColor: "#FB7185", strokeWidthPx: 8, strokeColor: "#111827", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 4, shadowBlurPx: 12, shadowColor: "#000000", shadowOpacity: .3, switchCaptionsEveryMs: 520, verticalPositionPx: 860, behavior: "scaling" }),
  "dl-handwritten-notes": originalDialogueLabPreset("dl-handwritten-notes", { fontFamily: "Caveat", fontSizePx: 96, fontWeight: 600, textColor: "#FFFBEB", activeWordColor: "#22D3EE", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 3, shadowBlurPx: 8, shadowColor: "#000000", shadowOpacity: .3, switchCaptionsEveryMs: 650, verticalPositionPx: 860, behavior: "colored" }),
  "dl-wide-impact": originalDialogueLabPreset("dl-wide-impact", { fontFamily: "Oswald", fontSizePx: 110, fontWeight: 700, textColor: "#FFFFFF", activeWordColor: "#3B82F6", strokeWidthPx: 8, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 2, shadowBlurPx: 10, shadowColor: "#000000", shadowOpacity: .2, switchCaptionsEveryMs: 540, verticalPositionPx: 860, behavior: "scaling" }),
  "dl-clean-minimal": originalDialogueLabPreset("dl-clean-minimal", { fontFamily: "Manrope", fontSizePx: 96, fontWeight: 700, textColor: "#FFFFFF", activeWordColor: "#14B8A6", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 4, shadowBlurPx: 12, shadowColor: "#000000", shadowOpacity: .25, switchCaptionsEveryMs: 700, verticalPositionPx: 860, behavior: "default" }),
  "dl-upper-third": originalDialogueLabPreset("dl-upper-third", { fontFamily: "Inter Tight", fontSizePx: 90, fontWeight: 700, textColor: "#FFFFFF", activeWordColor: "#F43F5E", strokeWidthPx: 5, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 3, shadowBlurPx: 8, shadowColor: "#000000", shadowOpacity: .35, switchCaptionsEveryMs: 600, verticalPositionPx: 860, behavior: "scaling" }),
  "dl-caption-bar": originalDialogueLabPreset("dl-caption-bar", { fontFamily: "League Spartan", fontSizePx: 92, fontWeight: 700, textColor: "#111827", activeWordColor: "#F59E0B", strokeWidthPx: 2, strokeColor: "#FFFFFF", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 2, shadowBlurPx: 4, shadowColor: "#000000", shadowOpacity: .15, switchCaptionsEveryMs: 550, verticalPositionPx: 860, behavior: "highlight" }),
  "dl-contrast-drop": originalDialogueLabPreset("dl-contrast-drop", { fontFamily: "Rubik", fontSizePx: 100, fontWeight: 800, textColor: "#FFFFFF", activeWordColor: "#F97316", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 0, shadowOffsetY: 8, shadowBlurPx: 20, shadowColor: "#000000", shadowOpacity: .5, switchCaptionsEveryMs: 700, verticalPositionPx: 860, behavior: "default" }),
  "dl-headline-condensed": originalDialogueLabPreset("dl-headline-condensed", { fontFamily: "Fjalla One", fontSizePx: 114, fontWeight: 400, textColor: "#FFFFFF", activeWordColor: "#22C55E", strokeWidthPx: 8, strokeColor: "#000000", shadowEnabled: false, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlurPx: 0, shadowColor: "#000000", shadowOpacity: 0, switchCaptionsEveryMs: 560, verticalPositionPx: 860, behavior: "colored" }),
  "dl-retro-pixel": originalDialogueLabPreset("dl-retro-pixel", { fontFamily: "Silkscreen", fontSizePx: 80, fontWeight: 400, textColor: "#E2E8F0", activeWordColor: "#22D3EE", strokeWidthPx: 4, strokeColor: "#000000", shadowEnabled: false, shadowOffsetX: 0, shadowOffsetY: 0, shadowBlurPx: 0, shadowColor: "#000000", shadowOpacity: 0, switchCaptionsEveryMs: 750, verticalPositionPx: 860, behavior: "default" }),
  "fsp-classic": { ...originalDialogueLabPreset("fsp-classic", { fontFamily: "Titan One", fontSizePx: 120, fontWeight: 400, textColor: "#FFFFFF", activeWordColor: "#39E508", strokeWidthPx: 20, strokeColor: "#000000", shadowEnabled: true, shadowOffsetX: 2, shadowOffsetY: 4, shadowBlurPx: 6, shadowColor: "#000000", shadowOpacity: .3, switchCaptionsEveryMs: 800, verticalPositionPx: 1113.6, behavior: "default" }), maxWidthPercent: 85 },
  "hf-block-pop": { ...DEFAULT_CAPTION_STYLE, presetId: "hf-block-pop", fontFamily: "Inter", fontWeight: 900, textTransform: "uppercase", textColor: "#000000", activeWordColor: "#F7CB46", activeWordTextColor: "#000000", activeWordEmphasis: "highlight", activeWordRadiusPx: 0, inactiveWordOpacity: .4, wordGapEm: .2, strokeWidthPx: 0, shadowEnabled: false, lineHeight: 1.12, surfaceEnabled: true, surfaceColor: "#FFFFFF", surfaceOpacity: 1, surfacePaddingX: 40, surfacePaddingY: 20, surfaceBorderColor: "#000000", surfaceBorderWidthPx: 4, surfaceBorderRadiusPx: 0, surfaceShadowColor: "#000000", surfaceShadowOffsetX: 8, surfaceShadowOffsetY: 8, surfaceShadowBlurPx: 0, surfaceShadowOpacity: 1 },
  "hf-cobalt-chip": { ...DEFAULT_CAPTION_STYLE, presetId: "hf-cobalt-chip", fontFamily: "Montserrat", fontWeight: 600, textTransform: "none", textColor: "#111111", activeWordColor: "#1E2BFA", activeWordTextColor: "#FDFAE7", activeWordEmphasis: "highlight", activeWordRadiusPx: 12, inactiveWordOpacity: .52, wordGapEm: .2, strokeWidthPx: 0, shadowEnabled: false, lineHeight: 1.16, surfaceEnabled: true, surfaceColor: "#F5F4FF", surfaceOpacity: .98, surfacePaddingX: 44, surfacePaddingY: 22, surfaceBorderColor: "#C7CBFF", surfaceBorderWidthPx: 2, surfaceBorderRadiusPx: 14, surfaceShadowOpacity: 0 },
  "hf-broadside": { ...DEFAULT_CAPTION_STYLE, presetId: "hf-broadside", fontFamily: "Anton", fontWeight: 900, textTransform: "lowercase", textColor: "#F0ECE5", activeWordColor: "#E85D26", activeWordTextColor: "#111111", activeWordEmphasis: "highlight", activeWordRadiusPx: 0, inactiveWordOpacity: .42, wordGapEm: .18, strokeWidthPx: 0, shadowEnabled: false, lineHeight: 1.02, surfaceEnabled: true, surfaceColor: "#111111", surfaceOpacity: 1, surfacePaddingX: 44, surfacePaddingY: 20, surfaceBorderColor: "#E85D26", surfaceBorderWidthPx: 1, surfaceBorderRadiusPx: 0, surfaceShadowOpacity: 0 },
  "hf-capsule": { ...DEFAULT_CAPTION_STYLE, presetId: "hf-capsule", fontFamily: "Poppins", fontWeight: 700, textTransform: "none", textColor: "#1A1A1A", activeWordColor: "#E85D4E", activeWordTextColor: "#1A1A1A", activeWordEmphasis: "highlight", activeWordRadiusPx: 40, inactiveWordOpacity: .42, wordGapEm: .22, strokeWidthPx: 0, shadowEnabled: false, lineHeight: 1.16, surfaceEnabled: true, surfaceColor: "#F5F5F0", surfaceOpacity: 1, surfacePaddingX: 46, surfacePaddingY: 19, surfaceBorderColor: "#1A1A1A", surfaceBorderWidthPx: 2, surfaceBorderRadiusPx: 80, surfaceShadowColor: "#1A1A1A", surfaceShadowOffsetX: 8, surfaceShadowOffsetY: 8, surfaceShadowBlurPx: 0, surfaceShadowOpacity: .1 },
  "hf-editorial": { ...DEFAULT_CAPTION_STYLE, presetId: "hf-editorial", fontFamily: "Poppins", fontWeight: 500, textTransform: "none", textColor: "#1A1A17", activeWordColor: "#D27E96", activeWordTextColor: "#1A1A17", activeWordEmphasis: "highlight", activeWordRadiusPx: 6, inactiveWordOpacity: .42, wordGapEm: .2, strokeWidthPx: 0, shadowEnabled: false, lineHeight: 1.16, surfaceEnabled: true, surfaceColor: "#EFE7D4", surfaceOpacity: 1, surfacePaddingX: 44, surfacePaddingY: 22, surfaceBorderColor: "#D27E96", surfaceBorderWidthPx: 2, surfaceBorderRadiusPx: 6, surfaceShadowOpacity: 0 },
  "hf-code-underline": { ...DEFAULT_CAPTION_STYLE, presetId: "hf-code-underline", fontFamily: "Poppins", fontWeight: 500, textTransform: "none", textColor: "#141413", activeWordColor: "#CC785C", activeWordTextColor: "#141413", activeWordEmphasis: "underline", activeWordRadiusPx: 0, inactiveWordOpacity: .4, wordGapEm: .18, strokeWidthPx: 0, shadowEnabled: false, lineHeight: 1.22, surfaceEnabled: true, surfaceColor: "#FAF9F5", surfaceOpacity: 1, surfacePaddingX: 44, surfacePaddingY: 24, surfaceBorderColor: "#DFDDD7", surfaceBorderWidthPx: 1, surfaceBorderRadiusPx: 12, surfaceShadowColor: "#141413", surfaceShadowOffsetX: 0, surfaceShadowOffsetY: 4, surfaceShadowBlurPx: 16, surfaceShadowOpacity: .1 },
};

export interface CompiledRoleWindow extends ProjectTimelineWindow { linked: boolean }
export interface CompiledDialogueSegment {
  blockId: string;
  startSeconds: number;
  durationSeconds: number;
  sourceStartSeconds: number;
  sourceDurationSeconds: number;
  endSeconds: number;
  data: DialogueLineData;
  speech?: SpeechClipRecord;
  roles: Record<DialogueTimelineRole, CompiledRoleWindow>;
  transform?: ProjectElementTransform;
  motion?: ProjectClipMotion;
}

export interface CompiledDialogueTimeline {
  durationSeconds: number;
  segments: CompiledDialogueSegment[];
  tracks: ProjectTrack[];
}

export function normalizeProjectEditorState(state: Partial<ProjectEditorState> & Pick<ProjectEditorState, "canvas">): ProjectEditorState {
  const blocks = (state.blocks ?? []).map((block) => block.kind === "fake-text-message" ? ({ ...block, data: normalizeFakeTextMessage(block.data) }) : block.kind !== "dialogue-line" ? block : ({ ...block,
    timeline: normalizeBlockTimeline(block.timeline, block.id), data: {
      ...block.data,
      speechSpeed: isSpeechSpeed(block.data.speechSpeed) ? block.data.speechSpeed : "fast",
      hideSubtitles: block.data.hideSubtitles === true,
      gapAfterSeconds: finiteNumber(block.data.gapAfterSeconds, 0.35),
      captionWordsOverride: normalizeCaptionWords(block.data.captionWordsOverride),
      performanceCues: normalizePerformanceCues(block.data.performanceCues),
    },
  }));
  const authoredTracks = normalizeTracks(state.timeline?.tracks);
  return {
    schemaVersion: PROJECT_STATE_VERSION,
    projectType: state.projectType === "reddit-story" ? "reddit-story" : state.projectType === "fake-text" ? "fake-text" : "dialogue",
    fakeText: normalizeFakeTextSettings(state.fakeText),
    canvas: state.canvas,
    assets: { backgroundId: state.assets?.backgroundId, backgroundStartSeconds: Number(state.assets?.backgroundStartSeconds) || 0, characterIds: state.assets?.characterIds ?? [] },
    captions: normalizeCaptionStyle(state.captions, state.canvas.height),
    captionAnimation: normalizeCaptionAnimation(state.captionAnimation),
    timeline: { mode: state.timeline?.mode === "manual" ? "manual" : "flow", tracks: authoredTracks, items: normalizeItems(state.timeline?.items, authoredTracks) },
    blocks,
    scenes: state.scenes ?? [],
    tracks: state.tracks ?? [],
  };
}

export function dialogueBlocks(state: ProjectEditorState): Array<ProjectBlock & { data: DialogueLineData }> {
  return state.blocks.filter((block) => block.kind === "dialogue-line").sort((a, b) => a.order - b.order)
    .filter((block): block is ProjectBlock & { data: DialogueLineData } => isDialogueLineData(block.data));
}

export function fakeTextBlocks(state: ProjectEditorState): Array<ProjectBlock & { data: FakeTextMessageData }> {
  return state.blocks.filter((block) => block.kind === "fake-text-message").sort((a, b) => a.order - b.order)
    .filter((block): block is ProjectBlock & { data: FakeTextMessageData } => isFakeTextMessageData(block.data));
}

export function normalizeFakeTextSettings(value?: Partial<FakeTextSettings>): FakeTextSettings {
  return {
    ...DEFAULT_FAKE_TEXT_SETTINGS,
    ...value,
    staggerSeconds: Math.min(3, Math.max(.1, finiteNumber(value?.staggerSeconds, DEFAULT_FAKE_TEXT_SETTINGS.staggerSeconds))),
    holdSeconds: Math.min(10, Math.max(.2, finiteNumber(value?.holdSeconds, DEFAULT_FAKE_TEXT_SETTINGS.holdSeconds))),
    senderName: typeof value?.senderName === "string" ? value.senderName.slice(0, 80) : DEFAULT_FAKE_TEXT_SETTINGS.senderName,
    contactName: typeof value?.contactName === "string" ? value.contactName.slice(0, 80) : DEFAULT_FAKE_TEXT_SETTINGS.contactName,
    phoneTheme: value?.phoneTheme === "dark" ? "dark" : "light",
    phoneScalePercent: Math.min(96, Math.max(65, finiteNumber(value?.phoneScalePercent, DEFAULT_FAKE_TEXT_SETTINGS.phoneScalePercent))),
    gameplayDimPercent: Math.min(70, Math.max(0, finiteNumber(value?.gameplayDimPercent, DEFAULT_FAKE_TEXT_SETTINGS.gameplayDimPercent))),
    unreadCount: Math.round(Math.min(999, Math.max(0, finiteNumber(value?.unreadCount, DEFAULT_FAKE_TEXT_SETTINGS.unreadCount)))),
    showHeader: value?.showHeader !== false,
    showSenders: value?.showSenders === true,
    showTypingIndicator: value?.showTypingIndicator !== false,
  };
}

export function fakeTextDurationSeconds(state: ProjectEditorState): number {
  const settings = normalizeFakeTextSettings(state.fakeText); const count = fakeTextBlocks(state).length;
  return count ? Math.max(2, FAKE_TEXT_FIRST_MESSAGE_SECONDS + count * settings.staggerSeconds + settings.holdSeconds) : 0;
}

export function compileFakeTextTimeline(state: ProjectEditorState): CompiledDialogueTimeline {
  state = normalizeProjectEditorState(state); const settings = normalizeFakeTextSettings(state.fakeText); const messages = fakeTextBlocks(state); const durationSeconds = fakeTextDurationSeconds(state);
  return { durationSeconds, segments: [], tracks: [{ id: "messages", name: "Messages", kind: "messages", clips: messages.map((message, index) => ({
    id: `fake-text-${message.id}`, groupId: message.id, kind: "fake-text-message", startSeconds: FAKE_TEXT_FIRST_MESSAGE_SECONDS + index * settings.staggerSeconds,
    durationSeconds: Math.max(1 / state.canvas.fps, durationSeconds - (FAKE_TEXT_FIRST_MESSAGE_SECONDS + index * settings.staggerSeconds)), metadata: { messageId: message.id, ...message.data },
  })) }] };
}

export function compileDialogueTimeline(state: ProjectEditorState, speechClips: SpeechClipRecord[], backgroundDuration?: number): CompiledDialogueTimeline {
  state = normalizeProjectEditorState(state);
  const speechById = new Map(speechClips.map((clip) => [clip.id, clip])); const segments: CompiledDialogueSegment[] = [];
  const derived = new Map<string, ProjectTimelineClip[]>(); for (const track of state.timeline.tracks) derived.set(track.id, []);
  let cursor = 0; const manual = state.timeline.mode === "manual";
  for (const block of dialogueBlocks(state)) {
    const speech = block.data.speechClipId ? speechById.get(block.data.speechClipId) : undefined;
    const sourceDurationSeconds = speech?.durationSeconds ?? estimateSpeechDuration(block.data.text);
    const authored = manual ? block.timeline : undefined;
    const group = clampWindow({ startSeconds: manual ? authored?.startSeconds ?? cursor : cursor, durationSeconds: authored?.durationSeconds ?? sourceDurationSeconds,
      sourceStartSeconds: authored?.sourceStartSeconds ?? 0, trackId: "characters", locked: authored?.locked === true }, sourceDurationSeconds, state.canvas.fps);
    const roles = {
      character: roleWindow("character", group, authored, sourceDurationSeconds, state.canvas.fps),
      speech: roleWindow("speech", { ...group, trackId: "speech" }, authored, sourceDurationSeconds, state.canvas.fps),
      captions: roleWindow("captions", { ...group, trackId: "captions" }, authored, sourceDurationSeconds, state.canvas.fps),
    } satisfies Record<DialogueTimelineRole, CompiledRoleWindow>;
    const startSeconds = Math.min(roles.character.startSeconds, roles.speech.startSeconds, roles.captions.startSeconds);
    const endSeconds = Math.max(...Object.values(roles).map((role) => role.startSeconds + role.durationSeconds));
    const segment: CompiledDialogueSegment = { blockId: block.id, startSeconds, durationSeconds: endSeconds - startSeconds, sourceStartSeconds: group.sourceStartSeconds,
      sourceDurationSeconds, endSeconds, data: block.data, speech, roles, transform: block.timeline?.transform, motion: block.timeline?.motion };
    segments.push(segment);
    pushClip(derived, roles.character.trackId, { id: `character-${block.id}`, groupId: block.id, kind: "character-image", startSeconds: roles.character.startSeconds,
      durationSeconds: roles.character.durationSeconds, sourceId: block.data.characterImageId, metadata: { characterId: block.data.characterId, position: block.data.position,
        audioReady: Boolean(speech), linked: roles.character.linked, sourceStartSeconds: roles.character.sourceStartSeconds, transform: block.timeline?.transform, motion: block.timeline?.motion } });
    if (speech) {
      pushClip(derived, roles.speech.trackId, { id: `speech-${block.id}`, groupId: block.id, kind: "speech", startSeconds: roles.speech.startSeconds,
        durationSeconds: roles.speech.durationSeconds, sourceId: speech.id, metadata: { sourceStartSeconds: roles.speech.sourceStartSeconds, sourceDurationSeconds, linked: roles.speech.linked } });
      if (!block.data.hideSubtitles) pushClip(derived, roles.captions.trackId, { id: `captions-${block.id}`, groupId: block.id, kind: "captions", startSeconds: roles.captions.startSeconds,
        durationSeconds: roles.captions.durationSeconds, sourceId: speech.id, metadata: { timingSource: speech.timingSource, sourceStartSeconds: roles.captions.sourceStartSeconds, linked: roles.captions.linked } });
    }
    cursor = manual ? Math.max(cursor, endSeconds) : group.startSeconds + group.durationSeconds + Math.max(0, block.data.gapAfterSeconds);
  }
  if (manual) segments.sort((a, b) => a.startSeconds - b.startSeconds || a.blockId.localeCompare(b.blockId));

  for (const item of state.timeline.items) pushClip(derived, item.trackId, { id: `item-${item.id}`, kind: item.kind, startSeconds: item.startSeconds,
    durationSeconds: item.durationSeconds, sourceId: item.assetId, metadata: { itemId: item.id, text: item.text, sourceStartSeconds: item.sourceStartSeconds,
      transform: item.transform, motion: item.motion, transition: item.transition, characterId: item.characterId, characterImageId: item.characterImageId, locked: item.locked, hidden: item.hidden,
      volume: item.volume, playbackRate: item.playbackRate, muted: item.muted, loop: item.loop } });
  const dialogueDuration = manual ? Math.max(0, ...segments.map((segment) => segment.endSeconds))
    : segments.length ? Math.max(0, cursor - Math.max(0, dialogueBlocks(state).at(-1)?.data.gapAfterSeconds ?? 0)) : 0;
  const durationSeconds = Math.max(dialogueDuration, 0, ...state.timeline.items.filter((item) => !item.hidden).map((item) => item.startSeconds + item.durationSeconds));
  const tracks: ProjectTrack[] = [];
  if (state.assets.backgroundId && durationSeconds) tracks.push({ id: "background", name: "Background", kind: "background-video", clips: [{ id: "background-main", kind: "background-video", startSeconds: 0,
    durationSeconds, sourceId: state.assets.backgroundId, metadata: { mediaStartSeconds: state.assets.backgroundStartSeconds, sourceDurationSeconds: backgroundDuration, locked: true } }] });
  for (const track of [...state.timeline.tracks].sort((a, b) => a.order - b.order)) tracks.push({ id: track.id, name: track.name, kind: track.kind,
    clips: track.hidden ? [] : derived.get(track.id) ?? [] });
  return { durationSeconds, segments, tracks };
}

export function characterVisibleAt(segment: Pick<CompiledDialogueSegment, "startSeconds" | "endSeconds">, timeSeconds: number): boolean {
  return timeSeconds >= segment.startSeconds && timeSeconds < segment.endSeconds;
}

export function subtitlePageAt(words: SpeechWord[], relativeTimeSeconds: number, pageSize = 4): { words: SpeechWord[]; activeIndex: number } | undefined {
  const displayWords = words.filter((word) => word.type === "word");
  const active = displayWords.findIndex((word) => relativeTimeSeconds >= word.startSeconds && relativeTimeSeconds < word.endSeconds);
  if (active < 0) return undefined; const start = Math.floor(active / Math.max(1, pageSize)) * Math.max(1, pageSize);
  return { words: displayWords.slice(start, start + Math.max(1, pageSize)), activeIndex: active - start };
}

export function resolveDialoguePerformanceCues(data: DialogueLineData, speech?: SpeechClipRecord): Array<{ cue: DialoguePerformanceCue; sourceSeconds: number }> {
  const words = (data.captionWordsOverride ?? speech?.words ?? []).filter((word) => word.type === "word");
  return (data.performanceCues ?? []).flatMap((cue) => {
    const exact = cue.at.exact.normalize("NFKC").toLocaleLowerCase();
    let word = words[cue.at.wordIndex];
    if (!word || word.text.normalize("NFKC").toLocaleLowerCase() !== exact) {
      const matches = words.filter((candidate) => candidate.text.normalize("NFKC").toLocaleLowerCase() === exact);
      word = matches[Math.max(0, cue.at.occurrence - 1)];
    }
    return word ? [{ cue, sourceSeconds: word.startSeconds }] : [];
  }).sort((left, right) => left.sourceSeconds - right.sourceSeconds || left.cue.id.localeCompare(right.cue.id));
}

export function normalizeTransform(value?: Partial<ProjectElementTransform>, fallback = DEFAULT_PROJECT_TRANSFORM): ProjectElementTransform {
  return { xPercent: finiteNumber(value?.xPercent, fallback.xPercent), yPercent: finiteNumber(value?.yPercent, fallback.yPercent),
    widthPercent: finiteNumber(value?.widthPercent, fallback.widthPercent), heightPercent: finiteNumber(value?.heightPercent, fallback.heightPercent),
    rotationDegrees: finiteNumber(value?.rotationDegrees, fallback.rotationDegrees), opacity: finiteNumber(value?.opacity, fallback.opacity),
    zIndex: Math.trunc(finiteNumber(value?.zIndex, fallback.zIndex)) };
}

export function normalizeCaptionStyle(value?: Partial<ProjectCaptionStyle>, canvasHeight = 1920): ProjectCaptionStyle {
  const fallbackY = value?.position === "top" ? canvasHeight * .1 : value?.position === "middle" ? canvasHeight * .5 : canvasHeight * .9;
  return { ...DEFAULT_CAPTION_STYLE, ...value, verticalPositionPx: finiteNumber(value?.verticalPositionPx, fallbackY),
    switchCaptionsEveryMs: finiteNumber(value?.switchCaptionsEveryMs, DEFAULT_CAPTION_STYLE.switchCaptionsEveryMs),
    activeWordScale: Math.min(2, Math.max(.5, finiteNumber(value?.activeWordScale, DEFAULT_CAPTION_STYLE.activeWordScale))),
    activeWordTextColor: typeof value?.activeWordTextColor === "string" ? value.activeWordTextColor : value?.activeWordColor ?? DEFAULT_CAPTION_STYLE.activeWordTextColor,
    presetId: value?.presetId && [...Object.keys(CAPTION_PRESETS), "custom"].includes(value.presetId) ? value.presetId : DEFAULT_CAPTION_STYLE.presetId };
}

export function normalizeMotionConfig(value?: Partial<ProjectMotionConfig>, fallback = DEFAULT_MOTION_CONFIG): ProjectMotionConfig {
  return { preset: PROJECT_MOTION_PRESETS.includes(value?.preset as ProjectMotionConfig["preset"]) ? value!.preset! : fallback.preset,
    durationSeconds: Math.max(0, finiteNumber(value?.durationSeconds, fallback.durationSeconds)),
    easing: ["smooth", "snappy", "gentle"].includes(String(value?.easing)) ? value!.easing! : fallback.easing,
    direction: ["left", "right", "up", "down"].includes(String(value?.direction)) ? value!.direction! : fallback.direction };
}
export function normalizeProjectMotion(value?: Partial<{ entrance: Partial<ProjectMotionConfig>; during: Partial<ProjectMotionConfig>; exit: Partial<ProjectMotionConfig>; combo: Partial<ProjectMotionConfig> }>, fallback = DEFAULT_PROJECT_MOTION): ProjectClipMotion & { combo: ProjectMotionConfig } {
  return { entrance: normalizeMotionConfig(value?.entrance, fallback.entrance), during: normalizeMotionConfig(value?.during, fallback.during), exit: normalizeMotionConfig(value?.exit, fallback.exit), combo: normalizeMotionConfig(value?.combo, fallback.combo) };
}
export function normalizeSceneTransition(value?: Partial<ProjectSceneTransition>, fallback = DEFAULT_SCENE_TRANSITION): ProjectSceneTransition {
  return { preset: ["cut", "fade", "crossfade", "slide", "zoom"].includes(String(value?.preset)) ? value!.preset! : fallback.preset,
    durationSeconds: Math.max(0, finiteNumber(value?.durationSeconds, fallback.durationSeconds)),
    direction: ["left", "right", "up", "down"].includes(String(value?.direction)) ? value!.direction! : fallback.direction };
}
export function normalizeCaptionAnimation(value?: Partial<ProjectEditorState["captionAnimation"]>): ProjectEditorState["captionAnimation"] {
  return { preset: ["none", "pop", "word-reveal", "karaoke", "bounce"].includes(String(value?.preset)) ? value!.preset! : "none",
    durationSeconds: Math.max(0, finiteNumber(value?.durationSeconds, .2)) };
}

function roleWindow(role: DialogueTimelineRole, fallback: ProjectTimelineWindow, authored: ProjectBlockTimeline | undefined, sourceDuration: number, fps: number): CompiledRoleWindow {
  const override = authored?.roleOverrides?.[role];
  if (role === "character" && override) return { ...override, startSeconds: Math.max(0, override.startSeconds), durationSeconds: Math.max(1 / fps, override.durationSeconds), sourceStartSeconds: 0, linked: false };
  return { ...clampWindow(override ?? fallback, sourceDuration, fps), linked: !override };
}
function clampWindow(value: ProjectTimelineWindow, sourceDuration: number, fps: number): ProjectTimelineWindow {
  const minimum = 1 / Math.max(1, fps); const sourceStartSeconds = Math.min(Math.max(0, value.sourceStartSeconds), Math.max(0, sourceDuration - minimum));
  return { ...value, startSeconds: Math.max(0, value.startSeconds), sourceStartSeconds,
    durationSeconds: Math.min(Math.max(minimum, value.durationSeconds), Math.max(minimum, sourceDuration - sourceStartSeconds)) };
}
function pushClip(tracks: Map<string, ProjectTimelineClip[]>, trackId: string, clip: ProjectTimelineClip) {
  const destination = tracks.get(trackId) ?? tracks.get(clip.kind === "speech" ? "speech" : clip.kind === "captions" ? "captions" : "overlays"); destination?.push(clip);
}
function normalizeTracks(value?: ProjectAuthoredTrack[]): ProjectAuthoredTrack[] {
  const supplied = Array.isArray(value) ? value : []; const byId = new Map(supplied.map((track) => [track.id, track]));
  const merged = DEFAULT_PROJECT_TRACKS.map((track) => ({ ...track, ...byId.get(track.id), id: track.id, system: true }));
  for (const track of supplied) if (DEFAULT_PROJECT_TRACKS.some((item) => item.id === track.id)) continue; else merged.push({ ...track, system: false });
  return merged.sort((a, b) => a.order - b.order).map((track, order) => ({ ...track, order }));
}
function normalizeItems(value: ProjectAuthoredTimelineItem[] | undefined, tracks: ProjectAuthoredTrack[]): ProjectAuthoredTimelineItem[] {
  const ids = new Set(tracks.map((track) => track.id)); return (Array.isArray(value) ? value : []).map((item) => ({ ...item,
    trackId: ids.has(item.trackId) ? item.trackId : item.kind === "audio" ? "audio" : "overlays", startSeconds: Math.max(0, finiteNumber(item.startSeconds, 0)),
    durationSeconds: Math.max(1 / 120, finiteNumber(item.durationSeconds, 3)), sourceStartSeconds: Math.max(0, finiteNumber(item.sourceStartSeconds, 0)),
    transform: normalizeTransform(item.transform), motion: normalizeProjectMotion(item.motion), transition: normalizeSceneTransition(item.transition),
    volume: Math.min(1, Math.max(0, finiteNumber(item.volume, 1))), playbackRate: Math.min(4, Math.max(.25, finiteNumber(item.playbackRate, 1))), muted: item.muted === true, loop: item.loop === true,
    locked: item.locked === true, hidden: item.hidden === true,
  }));
}
function normalizeBlockTimeline(value: ProjectBlock["timeline"], blockId: string): ProjectBlock["timeline"] {
  if (!value) return undefined;
  return { startSeconds: Math.max(0, finiteNumber(value.startSeconds, 0)), durationSeconds: Math.max(1 / 120, finiteNumber(value.durationSeconds, 1)),
    sourceStartSeconds: Math.max(0, finiteNumber(value.sourceStartSeconds, 0)), linkGroupId: value.linkGroupId || blockId, locked: value.locked === true,
    transform: value.transform ? normalizeTransform(value.transform) : undefined, motion: value.motion ? normalizeProjectMotion(value.motion) : undefined };
}
function estimateSpeechDuration(text: string): number { return Math.max(0.8, (text.match(/\S+/g)?.length ?? 1) / 2.5); }
function isDialogueLineData(value: Record<string, unknown>): value is Record<string, unknown> & DialogueLineData {
  return typeof value.characterId === "string" && typeof value.characterImageId === "string" && typeof value.text === "string"
    && (value.position === "left" || value.position === "center" || value.position === "right") && typeof value.gapAfterSeconds === "number"
    && isSpeechSpeed(value.speechSpeed) && typeof value.hideSubtitles === "boolean";
}
function isFakeTextMessageData(value: Record<string, unknown>): value is Record<string, unknown> & FakeTextMessageData {
  return (value.side === "incoming" || value.side === "outgoing") && typeof value.text === "string" && typeof value.sender === "string";
}
function normalizeFakeTextMessage(value: Record<string, unknown>): FakeTextMessageData {
  return { ...value, side: value.side === "outgoing" ? "outgoing" : "incoming", text: typeof value.text === "string" ? value.text : "", sender: typeof value.sender === "string" ? value.sender : "" };
}
function finiteNumber(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function normalizeCaptionWords(value: unknown): SpeechWord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const words = value.filter((item): item is SpeechWord => Boolean(item) && typeof item === "object" && typeof item.text === "string" && ["word", "spacing", "punctuation"].includes(String(item.type)) && Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds))
    .map((item) => ({ ...item, startSeconds: Math.max(0, item.startSeconds), endSeconds: Math.max(item.startSeconds, item.endSeconds) }));
  return words.length ? words : undefined;
}
function normalizePerformanceCues(value: unknown): DialoguePerformanceCue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>(); const cues = value.filter((item): item is DialoguePerformanceCue => Boolean(item) && typeof item === "object"
    && typeof item.id === "string" && typeof item.characterImageId === "string" && Boolean(item.at) && typeof item.at === "object")
    .filter((item) => !ids.has(item.id) && Boolean(ids.add(item.id)))
    .map((item) => ({ id: item.id, characterImageId: item.characterImageId, at: {
      wordIndex: Math.max(0, Math.round(finiteNumber(item.at.wordIndex, 0))), exact: String(item.at.exact ?? "").slice(0, 200),
      occurrence: Math.max(1, Math.round(finiteNumber(item.at.occurrence, 1))), prefix: String(item.at.prefix ?? "").slice(0, 300), suffix: String(item.at.suffix ?? "").slice(0, 300),
    } }));
  return cues.length ? cues : undefined;
}
function isSpeechSpeed(value: unknown): value is DialogueLineData["speechSpeed"] { return value === "slow" || value === "normal" || value === "fast"; }
