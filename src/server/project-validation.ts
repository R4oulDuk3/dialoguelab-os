import type { ProjectCaptionStyle, ProjectEditorState } from "@/shared/contracts";
import { CAPTION_PRESETS, normalizeProjectEditorState, PROJECT_MOTION_PRESETS } from "@/shared/project-timeline";

const presets = new Set<ProjectCaptionStyle["presetId"]>([...Object.keys(CAPTION_PRESETS) as Array<Exclude<ProjectCaptionStyle["presetId"], "custom">>, "custom"]);
const hexColor = /^#[0-9A-F]{6}$/i;

export function validateProjectState(value: ProjectEditorState): ProjectEditorState {
  if (!value || !value.canvas) throw new Error("Project editor state is invalid.");
  const normalized = normalizeProjectEditorState(value);
  if (!Array.isArray(normalized.assets.characterIds) || !Array.isArray(normalized.blocks) || !Array.isArray(normalized.scenes) || !Array.isArray(normalized.tracks))
    throw new Error("Project editor state is invalid.");
  const { width, height, fps } = normalized.canvas;
  if (![width, height, fps].every(Number.isInteger) || width < 240 || height < 240 || width > 8192 || height > 8192 || fps < 1 || fps > 120)
    throw new Error("Project canvas dimensions or frame rate are invalid.");
  if (normalized.blocks.length > 10_000 || normalized.scenes.length > 10_000 || normalized.tracks.length > 1_000 || normalized.timeline.tracks.length > 1_000 || normalized.timeline.items.length > 10_000) throw new Error("Project editor state is too large.");
  validateCaptionStyle(normalized.captions);
  if (!["none", "pop", "word-reveal", "karaoke", "bounce"].includes(normalized.captionAnimation.preset) || !between(normalized.captionAnimation.durationSeconds, 0, 3)) throw new Error("Project caption animation is invalid.");
  if (normalized.timeline.mode !== "flow" && normalized.timeline.mode !== "manual") throw new Error("Project timeline mode is invalid.");
  if (normalized.projectType === "fake-text") {
    const settings = normalized.fakeText!; const colors = [settings.incomingBubbleColor, settings.incomingTextColor, settings.outgoingBubbleColor, settings.outgoingTextColor, settings.backgroundTopColor, settings.backgroundBottomColor];
    if (!colors.every((color) => hexColor.test(color)) || !between(settings.staggerSeconds, .1, 3) || !between(settings.holdSeconds, .2, 10)
      || typeof settings.senderName !== "string" || settings.senderName.length > 80 || typeof settings.contactName !== "string" || settings.contactName.length > 80
      || !["light", "dark"].includes(settings.phoneTheme) || !between(settings.phoneScalePercent, 65, 96) || !between(settings.gameplayDimPercent, 0, 70)
      || !Number.isInteger(settings.unreadCount) || !between(settings.unreadCount, 0, 999) || typeof settings.showHeader !== "boolean"
      || typeof settings.showSenders !== "boolean" || typeof settings.showTypingIndicator !== "boolean") throw new Error("Fake Text design settings are invalid.");
  }
  const trackIds = new Set<string>(); for (const track of normalized.timeline.tracks) {
    if (!track.id || trackIds.has(track.id) || !track.name.trim() || !["visual", "audio", "captions"].includes(track.kind) || !Number.isInteger(track.order)) throw new Error("A project track is invalid."); trackIds.add(track.id);
  }
  const itemIds = new Set<string>(); for (const item of normalized.timeline.items) {
    if (!item.id || itemIds.has(item.id) || !trackIds.has(item.trackId) || !["image", "video", "audio", "text", "character-pose"].includes(item.kind)
      || !between(item.startSeconds, 0, 86_400) || !between(item.durationSeconds, 1 / 120, 86_400) || !between(item.sourceStartSeconds, 0, 86_400)
      || !between(item.volume, 0, 1) || !between(item.playbackRate, .25, 4) || typeof item.muted !== "boolean" || typeof item.loop !== "boolean") throw new Error("A timeline item is invalid.");
    validateTransform(item.transform); validateMotion(item.motion); if (!["cut", "fade", "crossfade", "slide", "zoom"].includes(item.transition.preset) || !["left", "right", "up", "down"].includes(item.transition.direction) || !between(item.transition.durationSeconds, 0, 10)) throw new Error("Element transition is invalid."); itemIds.add(item.id);
  }
  for (const block of normalized.blocks) {
    if (block.kind === "fake-text-message" && (normalized.projectType !== "fake-text" || !["incoming", "outgoing"].includes(String(block.data.side)) || typeof block.data.text !== "string" || block.data.text.length > 5_000 || typeof block.data.sender !== "string" || block.data.sender.length > 80)) throw new Error("A Fake Text message is invalid.");
    if (!block.timeline) continue;
    if (![block.timeline.startSeconds, block.timeline.durationSeconds, block.timeline.sourceStartSeconds].every(Number.isFinite)
      || block.timeline.startSeconds < 0 || block.timeline.durationSeconds <= 0 || block.timeline.sourceStartSeconds < 0 || !block.timeline.linkGroupId)
      throw new Error("A project block has invalid authored timing.");
    if (block.timeline.transform) validateTransform(block.timeline.transform); if (block.timeline.motion) validateMotion(block.timeline.motion);
    for (const role of Object.values(block.timeline.roleOverrides ?? {})) if (role && (!trackIds.has(role.trackId) || role.startSeconds < 0 || role.durationSeconds <= 0 || role.sourceStartSeconds < 0)) throw new Error("A dialogue role has invalid authored timing.");
  }
  const serialized = JSON.stringify(normalized); if (serialized.length > 5 * 1024 * 1024) throw new Error("Project editor state cannot exceed 5 MB.");
  return JSON.parse(serialized) as ProjectEditorState;
}

export function validateCaptionStyle(style: ProjectCaptionStyle): ProjectCaptionStyle {
  if (!presets.has(style.presetId)) throw new Error("Choose a valid caption preset.");
  if (typeof style.fontFamily !== "string" || !style.fontFamily.trim() || style.fontFamily.length > 80 || /[\u0000-\u001f]/.test(style.fontFamily)) throw new Error("Choose a valid local caption font.");
  if (!between(style.fontSizePx, 24, 180) || ![400, 500, 600, 700, 800, 900].includes(style.fontWeight)) throw new Error("Caption font settings are invalid.");
  if (![style.textColor, style.activeWordColor, style.activeWordTextColor, style.strokeColor, style.shadowColor, style.surfaceColor, style.surfaceBorderColor, style.surfaceShadowColor].every((color) => hexColor.test(color))) throw new Error("Caption colors must use #RRGGBB format.");
  if (!["text", "highlight", "underline"].includes(style.activeWordEmphasis) || !between(style.activeWordRadiusPx, 0, 999) || !between(style.activeWordScale, .5, 2) || !between(style.inactiveWordOpacity, .1, 1) || !between(style.wordGapEm, 0, .8)) throw new Error("Caption word emphasis settings are invalid.");
  if (!between(style.strokeWidthPx, 0, 24) || !between(style.shadowBlurPx, 0, 40) || !between(style.shadowOffsetX, -20, 20)
    || !between(style.shadowOffsetY, -20, 20) || !between(style.shadowOpacity, 0, 1)) throw new Error("Caption outline or shadow settings are invalid.");
  if (typeof style.surfaceEnabled !== "boolean" || !between(style.surfaceOpacity, 0, 1) || !between(style.surfacePaddingX, 0, 120) || !between(style.surfacePaddingY, 0, 80)
    || !between(style.surfaceBorderWidthPx, 0, 16) || !between(style.surfaceBorderRadiusPx, 0, 999) || !between(style.surfaceShadowOffsetX, -30, 30)
    || !between(style.surfaceShadowOffsetY, -30, 30) || !between(style.surfaceShadowBlurPx, 0, 60) || !between(style.surfaceShadowOpacity, 0, 1)) throw new Error("Caption surface settings are invalid.");
  if (!between(style.edgeOffsetPercent, 0, 30) || !between(style.maxWidthPercent, 40, 96) || !Number.isInteger(style.wordsPerPage)
    || !between(style.wordsPerPage, 1, 8) || !between(style.switchCaptionsEveryMs, 100, 5_000) || !between(style.verticalPositionPx, 0, 8192)
    || !between(style.lineHeight, 0.8, 1.6)) throw new Error("Caption layout settings are invalid.");
  return style;
}

function between(value: number, min: number, max: number) { return Number.isFinite(value) && value >= min && value <= max; }
function validateTransform(value: ProjectEditorState["timeline"]["items"][number]["transform"]) {
  if (![value.xPercent, value.yPercent, value.widthPercent, value.heightPercent, value.rotationDegrees, value.opacity, value.zIndex].every(Number.isFinite)
    || !between(value.xPercent, -100, 200) || !between(value.yPercent, -100, 200) || !between(value.widthPercent, 1, 300) || !between(value.heightPercent, 1, 300)
    || !between(value.rotationDegrees, -360, 360) || !between(value.opacity, 0, 1) || !Number.isInteger(value.zIndex) || !between(value.zIndex, -1000, 1000)) throw new Error("An element transform is invalid.");
}
function validateMotion(value: ProjectEditorState["timeline"]["items"][number]["motion"]) { for (const item of [value.entrance, value.during, value.exit, value.combo].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) if (!PROJECT_MOTION_PRESETS.includes(item.preset) || !["smooth", "snappy", "gentle"].includes(item.easing) || !["left", "right", "up", "down"].includes(item.direction) || !between(item.durationSeconds, 0, 10)) throw new Error("Element motion is invalid."); }
