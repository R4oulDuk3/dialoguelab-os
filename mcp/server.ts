import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CaptionPresetId, CharacterImageUpload, DesignPreview, ImageUpload, ProjectCommand, ProviderId } from "../src/shared/contracts";
import { assertProvider, backgroundService, characterService, mediaService, projectService, providerService, speechService, subtitleEngineService, voiceService } from "../src/server/services";
import { CAPTION_PRESETS, dialogueBlocks, fakeTextBlocks } from "../src/shared/project-timeline";
import { renderService } from "../src/server/render-service";
import { projectCommandService } from "../src/server/project-command-service";
import { fontService } from "../src/server/font-service";
import { APP_VERSION } from "../src/shared/version";

const server = new McpServer(
  { name: "dialoguelab-local", version: APP_VERSION },
  {
    instructions: "Use Dialogue Lab tools directly; do not create helper scripts unless the user explicitly asks for repeatable automation. Read get_project_summary or get_project_timeline before editing. Prefer apply_project_edits for multi-step authoring, always pass expectedRevision from the latest read, and keep dialogue voice, captions, and character timing linked. render_project queues work: poll get_render_job until it reaches a terminal state.",
  },
);
const pendingPreviews = new Map<string, DesignPreview>();
const providerSchema = z.enum(["elevenlabs", "minimax", "fish"]);
const cloudProviderSchema = providerSchema;
const execFileAsync = promisify(execFile);

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}
function toolError(error: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
}

function requireCharacter(localCharacterId: string) {
  const character = characterService.list().find((item) => item.id === localCharacterId);
  if (!character) throw new Error("Character not found.");
  return character;
}

function requireDialogueLine(localProjectId: string, lineId: string) {
  const project = projectService.get(localProjectId);
  const line = dialogueBlocks(project.editorState).find((item) => item.id === lineId);
  if (!line) throw new Error("Dialogue line not found.");
  return { project, line };
}
function requireFakeTextMessage(localProjectId: string, messageId: string) {
  const project = projectService.get(localProjectId); const message = fakeTextBlocks(project.editorState).find((item) => item.id === messageId);
  if (!message) throw new Error("Fake Text message not found."); return { project, message };
}
async function generateAttachedDialogueAudio(localProjectId: string, lineId: string, speed?: "slow" | "normal" | "fast", language?: string) {
  const { line } = requireDialogueLine(localProjectId, lineId); const character = requireCharacter(line.data.characterId); const selectedSpeed = speed ?? line.data.speechSpeed;
  const clip = await speechService.generate({ voiceId: character.voiceId, text: line.data.text, speed: selectedSpeed, language });
  const applied = projectCommandService.apply({ localProjectId, source: "mcp", commands: [{ kind: "update-dialogue-line", lineId, patch: { speechSpeed: selectedSpeed, speechClipId: clip.id } }, { kind: "set-dialogue-caption-words", lineId, words: null }], summary: "Generated dialogue audio" });
  return { clip: { ...clip, audioPath: speechService.file(clip.id)?.path }, ...applied };
}
async function imageUpload(imagePath: string): Promise<ImageUpload> {
  const path = resolve(imagePath); const extension = extname(path).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : [".jpg", ".jpeg"].includes(extension) ? "image/jpeg" : undefined;
  if (!mimeType) throw new Error("Voice artwork must be a JPG, PNG, or WebP file.");
  return { name: path.split(/[\\/]/).pop() || `voice${extension}`, mimeType, bytes: new Uint8Array(await readFile(path)) };
}

server.registerTool("get_app_status", {
  title: "Get DialogueLab status",
  description: "Show the local database path indirectly through app state, connected voice providers, and voice count.",
  inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => result({ version: APP_VERSION, providers: providerService.statuses(), voiceCount: voiceService.list().length, characterCount: characterService.list().length,
  projectCount: projectService.list().length, backgroundCount: backgroundService.list().length, mediaAssetCount: mediaService.list().length, speechClipCount: speechService.list().length, subtitleEngine: subtitleEngineService.status() }));

server.registerTool("list_media_assets", {
  title: "List local media assets", description: "List reusable local image, video, and audio assets available to project timelines.", inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => result({ assets: mediaService.list() }));

server.registerTool("import_media_asset", {
  title: "Import a local media asset", description: "Copy an image, video, or audio file into the managed local media library. Dimensions and duration are detected locally with ffprobe.",
  inputSchema: { filePath: z.string().min(1), name: z.string().min(1).max(100).optional() },
}, async ({ filePath, name }) => { try { const path = resolve(filePath); const metadata = await probeMedia(path); return result({ asset: await mediaService.importFile({ name: name || path.split(/[\\/]/).pop() || "Media", filePath: path, ...metadata }) }); } catch (error) { return toolError(error); } });

const captionPresetIds = [...Object.keys(CAPTION_PRESETS), "custom"] as unknown as [string, ...string[]];
const captionPresetSchema = z.enum(captionPresetIds) as z.ZodType<CaptionPresetId>;
const captionStyleSchema = z.object({ presetId: captionPresetSchema, fontFamily: z.string().min(1).max(80),
  fontSizePx: z.number().min(24).max(180), fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800), z.literal(900)]),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]), textColor: z.string(), activeWordColor: z.string(), activeWordTextColor: z.string(), activeWordEmphasis: z.enum(["text", "highlight", "underline"]), activeWordRadiusPx: z.number().min(0).max(999), activeWordScale: z.number().min(.5).max(2), inactiveWordOpacity: z.number().min(.1).max(1), wordGapEm: z.number().min(0).max(.8), strokeColor: z.string(), strokeWidthPx: z.number().min(0).max(24),
  shadowEnabled: z.boolean(), shadowColor: z.string(), shadowBlurPx: z.number().min(0).max(40), shadowOffsetX: z.number().min(-20).max(20), shadowOffsetY: z.number().min(-20).max(20), shadowOpacity: z.number().min(0).max(1),
  position: z.enum(["top", "middle", "bottom"]), edgeOffsetPercent: z.number().min(0).max(30), maxWidthPercent: z.number().min(40).max(96), alignment: z.enum(["left", "center", "right"]), wordsPerPage: z.number().int().min(1).max(8), switchCaptionsEveryMs: z.number().min(100).max(5000), verticalPositionPx: z.number().min(0).max(8192), lineHeight: z.number().min(.8).max(1.6),
  surfaceEnabled: z.boolean(), surfaceColor: z.string(), surfaceOpacity: z.number().min(0).max(1), surfacePaddingX: z.number().min(0).max(120), surfacePaddingY: z.number().min(0).max(80), surfaceBorderColor: z.string(), surfaceBorderWidthPx: z.number().min(0).max(16), surfaceBorderRadiusPx: z.number().min(0).max(999), surfaceShadowColor: z.string(), surfaceShadowOffsetX: z.number().min(-30).max(30), surfaceShadowOffsetY: z.number().min(-30).max(30), surfaceShadowBlurPx: z.number().min(0).max(60), surfaceShadowOpacity: z.number().min(0).max(1) });
const dialoguePerformanceCueSchema = z.object({ id: z.string().uuid(), characterImageId: z.string().uuid(), at: z.object({ wordIndex: z.number().int().min(0), exact: z.string().min(1).max(200), occurrence: z.number().int().min(1), prefix: z.string().max(300), suffix: z.string().max(300) }) });

const editorStateSchema = z.object({
  schemaVersion: z.number().int().min(1),
  projectType: z.enum(["dialogue", "reddit-story", "fake-text"]),
  fakeText: z.object({ staggerSeconds: z.number().min(.1).max(3), holdSeconds: z.number().min(.2).max(10), senderName: z.string().max(80), contactName: z.string().max(80), phoneTheme: z.enum(["light", "dark"]), phoneScalePercent: z.number().min(65).max(96), gameplayDimPercent: z.number().min(0).max(70), unreadCount: z.number().int().min(0).max(999), showHeader: z.boolean(), incomingBubbleColor: z.string(), incomingTextColor: z.string(), outgoingBubbleColor: z.string(), outgoingTextColor: z.string(), backgroundTopColor: z.string(), backgroundBottomColor: z.string(), showSenders: z.boolean(), showTypingIndicator: z.boolean() }).optional(),
  canvas: z.object({ width: z.number().int().min(240).max(8192), height: z.number().int().min(240).max(8192), fps: z.number().int().min(1).max(120) }),
  assets: z.object({ backgroundId: z.string().optional(), backgroundStartSeconds: z.number().min(0), characterIds: z.array(z.string()) }),
  captions: captionStyleSchema,
  captionAnimation: z.object({ preset: z.enum(["none", "pop", "word-reveal", "karaoke", "bounce"]), durationSeconds: z.number().min(0).max(3) }),
  timeline: z.object({ mode: z.enum(["flow", "manual"]), tracks: z.array(z.any()), items: z.array(z.any()) }),
  blocks: z.array(z.object({ id: z.string(), kind: z.string(), order: z.number(), data: z.record(z.string(), z.unknown()), timeline: z.any().optional() })).max(10_000),
  scenes: z.array(z.record(z.string(), z.unknown())).max(10_000),
  tracks: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), clips: z.array(z.object({
    id: z.string(), groupId: z.string().optional(), kind: z.string(), startSeconds: z.number().min(0), durationSeconds: z.number().min(0), sourceId: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(),
  })) })).max(1_000),
});

server.registerTool("list_projects", {
  title: "List local projects",
  description: "List Dialogue, Reddit Story, and Fake Text projects with their versioned editor state, ordered by most recently changed.",
  inputSchema: { search: z.string().optional() }, annotations: { readOnlyHint: true },
}, async ({ search }) => {
  const query = search?.toLowerCase(); return result({ projects: projectService.list().filter((project) => !query || `${project.name} ${project.description}`.toLowerCase().includes(query)) });
});

server.registerTool("get_project", {
  title: "Get a local project",
  description: "Read one project including its canvas, scenes, tracks, schema version, and timestamps.",
  inputSchema: { localProjectId: z.string().uuid() }, annotations: { readOnlyHint: true },
}, async ({ localProjectId }) => { try { return result({ project: projectService.get(localProjectId) }); } catch (error) { return toolError(error); } });

server.registerTool("get_project_summary", {
  title: "Get a compact project summary",
  description: "Preferred project read before editing. Return metadata, revision, canvas, stage, dialogue outline, timeline counts, readiness, and validation issues without the full compiled track payload.",
  inputSchema: { localProjectId: z.string().uuid() }, annotations: { readOnlyHint: true },
}, async ({ localProjectId }) => {
  try {
    const project = projectService.get(localProjectId); const compiled = projectCommandService.timeline(localProjectId); const lines = dialogueBlocks(project.editorState);
    return result({
      project: { id: project.id, name: project.name, description: project.description, revision: project.revision, projectType: project.editorState.projectType, canvas: project.editorState.canvas,
        stage: project.editorState.assets, timelineMode: project.editorState.timeline.mode, trackCount: project.editorState.timeline.tracks.length, timelineItemCount: project.editorState.timeline.items.length,
        lineCount: lines.length, voicedLineCount: lines.filter((line) => Boolean(line.data.speechClipId)).length, canUndo: project.canUndo, canRedo: project.canRedo, updatedAt: project.updatedAt },
      dialogue: lines.map((line, index) => ({ lineNumber: index + 1, lineId: line.id, characterId: line.data.characterId, characterImageId: line.data.characterImageId,
        text: line.data.text, position: line.data.position, speechSpeed: line.data.speechSpeed, gapAfterSeconds: line.data.gapAfterSeconds, audioReady: Boolean(line.data.speechClipId) })),
      durationSeconds: compiled.timeline.durationSeconds,
      validationIssues: compiled.validationIssues,
    });
  } catch (error) { return toolError(error); }
});

server.registerTool("get_project_timeline", {
  title: "Get compiled project timeline",
  description: "Read the canonical dialogue segments, derived tracks, project revision, caption style, audio readiness, and validation issues used by both HyperFrames preview and local render.",
  inputSchema: { localProjectId: z.string().uuid() }, annotations: { readOnlyHint: true },
}, async ({ localProjectId }) => { try { return result(projectCommandService.timeline(localProjectId)); } catch (error) { return toolError(error); } });

server.registerTool("add_fake_text_message", {
  title: "Add a Fake Text message", description: "Add an incoming or outgoing message to a Fake Text project and return the revised deterministic message timeline.",
  inputSchema: { localProjectId: z.string().uuid(), side: z.enum(["incoming", "outgoing"]).default("incoming"), text: z.string().max(5000).default(""), sender: z.string().max(80).default(""), afterMessageId: z.string().uuid().optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, side, text, sender, afterMessageId, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "add-fake-text-message", message: { side, text, sender }, afterMessageId }], summary: "Added Fake Text message" })); } catch (error) { return toolError(error); } });

server.registerTool("update_fake_text_message", {
  title: "Update a Fake Text message", description: "Edit a Fake Text message's side, sender, or text without changing the rest of the conversation.",
  inputSchema: { localProjectId: z.string().uuid(), messageId: z.string().uuid(), side: z.enum(["incoming", "outgoing"]).optional(), text: z.string().max(5000).optional(), sender: z.string().max(80).optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, messageId, side, text, sender, expectedRevision }) => { try { requireFakeTextMessage(localProjectId, messageId); const patch = { ...(side ? { side } : {}), ...(text === undefined ? {} : { text }), ...(sender === undefined ? {} : { sender }) }; return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "update-fake-text-message", messageId, patch }], summary: "Updated Fake Text message" })); } catch (error) { return toolError(error); } });

server.registerTool("remove_fake_text_message", {
  title: "Remove a Fake Text message", description: "Remove one message from a Fake Text conversation.", inputSchema: { localProjectId: z.string().uuid(), messageId: z.string().uuid(), expectedRevision: z.number().int().min(0).optional() }, annotations: { destructiveHint: true },
}, async ({ localProjectId, messageId, expectedRevision }) => { try { requireFakeTextMessage(localProjectId, messageId); return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "remove-fake-text-message", messageId }], summary: "Removed Fake Text message" })); } catch (error) { return toolError(error); } });

server.registerTool("set_fake_text_style", {
  title: "Set Text Story style", description: "Update the DialogueLab-style chat header, participants, iMessage theme, gameplay treatment, message timing, and bubble colors.",
  inputSchema: { localProjectId: z.string().uuid(), style: z.object({ staggerSeconds: z.number().min(.1).max(3).optional(), holdSeconds: z.number().min(.2).max(10).optional(), senderName: z.string().max(80).optional(), contactName: z.string().max(80).optional(), phoneTheme: z.enum(["light", "dark"]).optional(), phoneScalePercent: z.number().min(65).max(96).optional(), gameplayDimPercent: z.number().min(0).max(70).optional(), unreadCount: z.number().int().min(0).max(999).optional(), showHeader: z.boolean().optional(), incomingBubbleColor: z.string().optional(), incomingTextColor: z.string().optional(), outgoingBubbleColor: z.string().optional(), outgoingTextColor: z.string().optional(), backgroundTopColor: z.string().optional(), backgroundBottomColor: z.string().optional(), showSenders: z.boolean().optional(), showTypingIndicator: z.boolean().optional() }), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, style, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-fake-text-settings", patch: style }], summary: "Updated Fake Text design" })); } catch (error) { return toolError(error); } });

server.registerTool("duplicate_dialogue_line", {
  title: "Duplicate a dialogue line",
  description: "Duplicate a line immediately after its source while intentionally leaving the duplicate without generated audio.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "duplicate-dialogue-line", lineId }], summary: "Duplicated dialogue line" })); } catch (error) { return toolError(error); } });

server.registerTool("reorder_dialogue_lines", {
  title: "Reorder dialogue lines",
  description: "Atomically set the complete dialogue order. Supply every current line ID exactly once.",
  inputSchema: { localProjectId: z.string().uuid(), lineIds: z.array(z.string().uuid()).max(10_000), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineIds, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "reorder-dialogue-lines", lineIds }], summary: "Reordered dialogue lines" })); } catch (error) { return toolError(error); } });

server.registerTool("set_project_caption_style", {
  title: "Set project caption style",
  description: "Update any project-wide subtitle design fields. Timing and generated speech are preserved.",
  inputSchema: { localProjectId: z.string().uuid(), style: captionStyleSchema.partial(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, style, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-caption-style", patch: style }], summary: "Updated subtitle style" })); } catch (error) { return toolError(error); } });

server.registerTool("set_dialogue_caption_words", {
  title: "Correct word-level captions",
  description: "Replace or reset the word-level caption transcript and timings for one voiced dialogue line without changing its audio.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), words: z.array(z.object({ text: z.string().max(200), type: z.enum(["word", "spacing", "punctuation"]), startSeconds: z.number().min(0), endSeconds: z.number().min(0) })).min(1).max(5000).nullable(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, words, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-dialogue-caption-words", lineId, words }], summary: words ? "Corrected word-level captions" : "Reset word-level captions" })); } catch (error) { return toolError(error); } });

server.registerTool("set_dialogue_performance_cues", {
  title: "Set Dialogue Clip performance cues",
  description: "Atomically replace the word-anchored pose changes inside one compound Dialogue Clip. Voice, captions, and character timing remain synchronized.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), cues: z.array(dialoguePerformanceCueSchema).max(200), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, cues, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-dialogue-performance-cues", lineId, cues }], summary: "Updated Dialogue Clip performance" })); } catch (error) { return toolError(error); } });

server.registerTool("list_project_history", {
  title: "List project edit history",
  description: "List reversible UI and MCP edit summaries for a project without returning every historical state body.",
  inputSchema: { localProjectId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(50) }, annotations: { readOnlyHint: true },
}, async ({ localProjectId, limit }) => { try { return result({ history: projectCommandService.history(localProjectId, limit) }); } catch (error) { return toolError(error); } });

server.registerTool("undo_project", {
  title: "Undo a project edit",
  description: "Undo the most recent reachable UI or MCP project edit and return the restored compiled timeline.",
  inputSchema: { localProjectId: z.string().uuid(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, expectedRevision }) => { try { return result(projectCommandService.undo(localProjectId, expectedRevision)); } catch (error) { return toolError(error); } });

server.registerTool("redo_project", {
  title: "Redo a project edit",
  description: "Redo the next reachable project edit and return the restored compiled timeline.",
  inputSchema: { localProjectId: z.string().uuid(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, expectedRevision }) => { try { return result(projectCommandService.redo(localProjectId, expectedRevision)); } catch (error) { return toolError(error); } });

const dialogueLinePatchSchema = z.object({ characterId: z.string().uuid().optional(), characterImageId: z.string().uuid().optional(), text: z.string().max(5000).optional(), position: z.enum(["left", "center", "right"]).optional(), speechSpeed: z.enum(["slow", "normal", "fast"]).optional(), speechClipId: z.string().uuid().optional(), performanceCues: z.array(dialoguePerformanceCueSchema).max(200).optional(), gapAfterSeconds: z.number().min(0).max(10).optional(), hideSubtitles: z.boolean().optional() });
const speechWordSchema = z.object({ text: z.string().max(200), type: z.enum(["word", "spacing", "punctuation"]), startSeconds: z.number().min(0), endSeconds: z.number().min(0) });
const elementTransformSchema = z.object({ xPercent: z.number().min(-100).max(200), yPercent: z.number().min(-100).max(200), widthPercent: z.number().min(1).max(300), heightPercent: z.number().min(1).max(300), rotationDegrees: z.number().min(-360).max(360), opacity: z.number().min(0).max(1), zIndex: z.number().int().min(-1000).max(1000) });
const motionPresetSchema = z.enum(["none", "fade", "slide", "pop", "scale", "rise", "drop", "zoom", "spin", "pulse", "fadeIn", "slideInLeft", "slideInRight", "slideInUp", "slideInDown", "grow", "zoomIn", "swooshIn", "magnetIn", "fadeOut", "slideOutLeft", "slideOutRight", "slideOutUp", "slideOutDown", "shrinkOut", "zoomOut", "swooshOut", "magnetOut", "float", "drift", "breathe", "sway", "shake", "handheld", "smoothGlitchZoomIn", "smoothGlitchZoomOut", "smoothGlitchIntenseZoomIn", "smoothGlitchIntenseZoomOut", "dramaticZoomIn", "dramaticZoomOut"]);
const motionConfigSchema = z.object({ preset: motionPresetSchema, durationSeconds: z.number().min(0).max(10), easing: z.enum(["smooth", "snappy", "gentle"]), direction: z.enum(["left", "right", "up", "down"]) });
const motionPatchSchema = z.object({ entrance: motionConfigSchema.partial().optional(), during: motionConfigSchema.partial().optional(), exit: motionConfigSchema.partial().optional(), combo: motionConfigSchema.partial().optional() });
const transitionSchema = z.object({ preset: z.enum(["cut", "fade", "crossfade", "slide", "zoom"]), durationSeconds: z.number().min(0).max(10), direction: z.enum(["left", "right", "up", "down"]) });
const fakeTextMessagePatchSchema = z.object({ side: z.enum(["incoming", "outgoing"]).optional(), text: z.string().max(5000).optional(), sender: z.string().max(80).optional() });
const fakeTextSettingsPatchSchema = z.object({ staggerSeconds: z.number().min(.1).max(3).optional(), holdSeconds: z.number().min(.2).max(10).optional(), senderName: z.string().max(80).optional(), contactName: z.string().max(80).optional(), phoneTheme: z.enum(["light", "dark"]).optional(), phoneScalePercent: z.number().min(65).max(96).optional(), gameplayDimPercent: z.number().min(0).max(70).optional(), unreadCount: z.number().int().min(0).max(999).optional(), showHeader: z.boolean().optional(), incomingBubbleColor: z.string().optional(), incomingTextColor: z.string().optional(), outgoingBubbleColor: z.string().optional(), outgoingTextColor: z.string().optional(), backgroundTopColor: z.string().optional(), backgroundBottomColor: z.string().optional(), showSenders: z.boolean().optional(), showTypingIndicator: z.boolean().optional() });
const batchCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("configure-stage"), backgroundId: z.string().uuid().nullable().optional(), backgroundStartSeconds: z.number().min(0).optional(), characterIds: z.array(z.string().uuid()).optional() }),
  z.object({ kind: z.literal("add-fake-text-message"), message: fakeTextMessagePatchSchema.optional(), afterMessageId: z.string().uuid().optional() }),
  z.object({ kind: z.literal("update-fake-text-message"), messageId: z.string().uuid(), patch: fakeTextMessagePatchSchema }),
  z.object({ kind: z.literal("duplicate-fake-text-message"), messageId: z.string().uuid() }),
  z.object({ kind: z.literal("remove-fake-text-message"), messageId: z.string().uuid() }),
  z.object({ kind: z.literal("reorder-fake-text-messages"), messageIds: z.array(z.string().uuid()) }),
  z.object({ kind: z.literal("set-fake-text-settings"), patch: fakeTextSettingsPatchSchema }),
  z.object({ kind: z.literal("add-dialogue-line"), line: dialogueLinePatchSchema.optional(), afterLineId: z.string().uuid().optional() }),
  z.object({ kind: z.literal("update-dialogue-line"), lineId: z.string().uuid(), patch: dialogueLinePatchSchema }),
  z.object({ kind: z.literal("set-dialogue-caption-words"), lineId: z.string().uuid(), words: z.array(speechWordSchema).min(1).max(5000).nullable() }),
  z.object({ kind: z.literal("set-dialogue-performance-cues"), lineId: z.string().uuid(), cues: z.array(dialoguePerformanceCueSchema).max(200) }),
  z.object({ kind: z.literal("duplicate-dialogue-line"), lineId: z.string().uuid() }),
  z.object({ kind: z.literal("remove-dialogue-line"), lineId: z.string().uuid() }),
  z.object({ kind: z.literal("reorder-dialogue-lines"), lineIds: z.array(z.string().uuid()) }),
  z.object({ kind: z.literal("set-dialogue-gap"), lineId: z.string().uuid(), gapAfterSeconds: z.number().min(0).max(10) }),
  z.object({ kind: z.literal("set-timeline-mode"), mode: z.enum(["flow", "manual"]) }),
  z.object({ kind: z.literal("set-dialogue-timings"), edits: z.array(z.object({ lineId: z.string().uuid(), startSeconds: z.number().min(0), durationSeconds: z.number().positive().optional(), sourceStartSeconds: z.number().min(0).optional() })).min(1).max(100) }),
  z.object({ kind: z.literal("set-dialogue-role-linked"), lineId: z.string().uuid(), role: z.enum(["character", "speech", "captions"]), linked: z.boolean() }),
  z.object({ kind: z.literal("set-dialogue-role-timings"), edits: z.array(z.object({ lineId: z.string().uuid(), role: z.enum(["character", "speech", "captions"]), startSeconds: z.number().min(0), durationSeconds: z.number().positive().optional(), sourceStartSeconds: z.number().min(0).optional(), trackId: z.string().optional() })).min(1).max(100) }),
  z.object({ kind: z.literal("set-block-transform"), blockId: z.string().uuid(), transform: elementTransformSchema.partial() }),
  z.object({ kind: z.literal("set-block-motion"), blockId: z.string().uuid(), motion: motionPatchSchema }),
  z.object({ kind: z.literal("set-caption-animation"), patch: z.object({ preset: z.enum(["none", "pop", "word-reveal", "karaoke", "bounce"]).optional(), durationSeconds: z.number().min(0).max(3).optional() }) }),
  z.object({ kind: z.literal("add-project-track"), name: z.string().min(1).max(60), trackKind: z.enum(["visual", "audio", "captions"]) }),
  z.object({ kind: z.literal("update-project-track"), trackId: z.string(), patch: z.object({ name: z.string().min(1).max(60).optional(), locked: z.boolean().optional(), hidden: z.boolean().optional() }) }),
  z.object({ kind: z.literal("remove-project-track"), trackId: z.string() }),
  z.object({ kind: z.literal("reorder-project-tracks"), trackIds: z.array(z.string()) }),
  z.object({ kind: z.literal("add-timeline-item"), item: z.object({ kind: z.enum(["image", "video", "audio", "text", "character-pose"]), trackId: z.string(), assetId: z.string().uuid().optional(), characterId: z.string().uuid().optional(), characterImageId: z.string().uuid().optional(), text: z.string().max(5000).optional(), startSeconds: z.number().min(0).optional(), durationSeconds: z.number().positive().optional(), sourceStartSeconds: z.number().min(0).optional(), transform: elementTransformSchema.partial().optional(), motion: motionPatchSchema.optional(), transition: transitionSchema.partial().optional(), volume: z.number().min(0).max(1).optional(), playbackRate: z.number().min(.25).max(4).optional(), muted: z.boolean().optional(), loop: z.boolean().optional(), locked: z.boolean().optional(), hidden: z.boolean().optional() }) }),
  z.object({ kind: z.literal("update-timeline-items"), edits: z.array(z.object({ itemId: z.string().uuid(), patch: z.object({ trackId: z.string().optional(), characterId: z.string().uuid().optional(), characterImageId: z.string().uuid().optional(), text: z.string().max(5000).optional(), startSeconds: z.number().min(0).optional(), durationSeconds: z.number().positive().optional(), sourceStartSeconds: z.number().min(0).optional(), transform: elementTransformSchema.partial().optional(), motion: motionPatchSchema.optional(), transition: transitionSchema.partial().optional(), volume: z.number().min(0).max(1).optional(), playbackRate: z.number().min(.25).max(4).optional(), muted: z.boolean().optional(), loop: z.boolean().optional(), locked: z.boolean().optional(), hidden: z.boolean().optional() }) })).min(1).max(100) }),
  z.object({ kind: z.literal("split-timeline-item"), itemId: z.string().uuid(), atSeconds: z.number().min(0) }),
  z.object({ kind: z.literal("remove-timeline-items"), itemIds: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({ kind: z.literal("set-caption-style"), patch: captionStyleSchema.partial() }),
]);

server.registerTool("apply_project_edits", {
  title: "Apply project edits atomically",
  description: "Preferred AI authoring surface. Apply 1–100 validated dialogue, Reddit Story, Fake Text, stage, ordering, timing, or subtitle edits as one SQLite transaction and one undo step.",
  inputSchema: { localProjectId: z.string().uuid(), edits: z.array(batchCommandSchema).min(1).max(100), expectedRevision: z.number().int().min(0).optional(), summary: z.string().max(200).optional() },
}, async ({ localProjectId, edits, expectedRevision, summary }) => {
  try { const commands = edits.map((edit) => edit.kind === "configure-stage" ? { ...edit, backgroundId: edit.backgroundId === null ? "" : edit.backgroundId } : edit) as ProjectCommand[];
    return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands, summary })); }
  catch (error) { return toolError(error); }
});

server.registerTool("set_project_timeline_mode", {
  title: "Set project timeline mode",
  description: "Switch between sequential Flow timing and absolute Manual timing. Entering Manual atomically freezes every current dialogue window so the preview does not jump.",
  inputSchema: { localProjectId: z.string().uuid(), mode: z.enum(["flow", "manual"]), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, mode, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-timeline-mode", mode }], summary: `Switched timeline to ${mode} mode` })); } catch (error) { return toolError(error); } });

server.registerTool("set_dialogue_timing", {
  title: "Set dialogue group timing",
  description: "Move or trim one linked dialogue group in Manual mode. Character, speech, and subtitles remain synchronized; sourceStartSeconds trims the beginning of speech and word timings.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), startSeconds: z.number().min(0), durationSeconds: z.number().positive().optional(), sourceStartSeconds: z.number().min(0).optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, startSeconds, durationSeconds, sourceStartSeconds, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-dialogue-timings", edits: [{ lineId, startSeconds, durationSeconds, sourceStartSeconds }] }], summary: "Edited linked dialogue timing" })); } catch (error) { return toolError(error); } });

server.registerTool("add_project_track", {
  title: "Add a project track", description: "Add a persistent custom visual, audio, or captions track and return the revised compiled timeline.",
  inputSchema: { localProjectId: z.string().uuid(), name: z.string().min(1).max(60), kind: z.enum(["visual", "audio", "captions"]), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, name, kind, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "add-project-track", name, trackKind: kind }], summary: `Added ${name} track` })); } catch (error) { return toolError(error); } });

server.registerTool("add_media_to_project_timeline", {
  title: "Add media to a project timeline", description: "Add a local image, video, or audio asset to an authored project track with optional timing and canvas transform.",
  inputSchema: { localProjectId: z.string().uuid(), localMediaId: z.string().uuid(), trackId: z.string(), startSeconds: z.number().min(0).default(0), durationSeconds: z.number().positive().optional(), sourceStartSeconds: z.number().min(0).default(0), transform: elementTransformSchema.partial().optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, localMediaId, trackId, startSeconds, durationSeconds, sourceStartSeconds, transform, expectedRevision }) => { try { const asset = mediaService.list().find((item) => item.id === localMediaId); if (!asset) throw new Error("Media asset not found."); return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "add-timeline-item", item: { kind: asset.kind, assetId: asset.id, trackId, startSeconds, durationSeconds, sourceStartSeconds, transform } }], summary: `Added ${asset.name} to timeline` })); } catch (error) { return toolError(error); } });

server.registerTool("add_text_to_project_timeline", {
  title: "Add text to a project timeline", description: "Add a free text overlay to a visual project track.", inputSchema: { localProjectId: z.string().uuid(), text: z.string().min(1).max(5000), trackId: z.string().default("overlays"), startSeconds: z.number().min(0).default(0), durationSeconds: z.number().positive().default(3), transform: elementTransformSchema.partial().optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, text, trackId, startSeconds, durationSeconds, transform, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "add-timeline-item", item: { kind: "text", text, trackId, startSeconds, durationSeconds, transform } }], summary: "Added text overlay" })); } catch (error) { return toolError(error); } });

server.registerTool("set_dialogue_role_linked", {
  title: "Repair a legacy Dialogue Clip link", description: "Relink a legacy character, speech, or captions override to its compound Dialogue Clip. New Dialogue Clips cannot be unlinked.", inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), role: z.enum(["character", "speech", "captions"]), linked: z.literal(true), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, role, linked, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-dialogue-role-linked", lineId, role, linked }], summary: `${linked ? "Linked" : "Unlinked"} dialogue ${role}` })); } catch (error) { return toolError(error); } });

server.registerTool("set_character_canvas_transform", {
  title: "Transform a character on canvas", description: "Set a dialogue character's canvas transform on one line, or apply the same values to every line spoken by that character.", inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), transform: elementTransformSchema.partial(), scope: z.enum(["line", "character"]).default("line"), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, transform, scope, expectedRevision }) => { try { const { project, line } = requireDialogueLine(localProjectId, lineId); const lineIds = scope === "character" ? dialogueBlocks(project.editorState).filter((item) => item.data.characterId === line.data.characterId).map((item) => item.id) : [lineId]; return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: lineIds.map((blockId) => ({ kind: "set-block-transform" as const, blockId, transform })), summary: scope === "character" ? "Transformed every line for dialogue character" : "Transformed dialogue character" })); } catch (error) { return toolError(error); } });

server.registerTool("add_character_pose_to_project_timeline", {
  title: "Add a character pose clip",
  description: "Add any pose from the project cast at an arbitrary timeline position. Pose clips are independent of dialogue and may overlap to show multiple characters simultaneously.",
  inputSchema: { localProjectId: z.string().uuid(), characterId: z.string().uuid(), characterImageId: z.string().uuid(), trackId: z.string().default("characters"), startSeconds: z.number().min(0).default(0), durationSeconds: z.number().positive().default(3), transform: elementTransformSchema.partial().optional(), motion: motionPatchSchema.optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, characterId, characterImageId, trackId, startSeconds, durationSeconds, transform, motion, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "add-timeline-item", item: { kind: "character-pose", characterId, characterImageId, trackId, startSeconds, durationSeconds, transform, motion } }], summary: "Added character pose clip" })); } catch (error) { return toolError(error); } });

server.registerTool("set_project_element_motion", {
  title: "Set visual element motion",
  description: "Set seek-safe entrance, during, exit, or full-clip combo motion for a dialogue character or authored timeline item. Preview and local render use the same deterministic HyperFrames timeline.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid().optional(), timelineItemId: z.string().uuid().optional(), motion: motionPatchSchema, expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, timelineItemId, motion, expectedRevision }) => { try { if (Boolean(lineId) === Boolean(timelineItemId)) throw new Error("Provide exactly one lineId or timelineItemId."); const command: ProjectCommand = lineId ? { kind: "set-block-motion", blockId: lineId, motion } : { kind: "update-timeline-items", edits: [{ itemId: timelineItemId!, patch: { motion } }] }; return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [command], summary: "Updated element motion" })); } catch (error) { return toolError(error); } });

server.registerTool("set_project_visual_transition", {
  title: "Set visual transition",
  description: "Set the transition-in behavior for an authored image or video scene clip.",
  inputSchema: { localProjectId: z.string().uuid(), timelineItemId: z.string().uuid(), transition: transitionSchema.partial(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, timelineItemId, transition, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "update-timeline-items", edits: [{ itemId: timelineItemId, patch: { transition } }] }], summary: "Updated visual transition" })); } catch (error) { return toolError(error); } });

server.registerTool("set_timeline_item_playback", {
  title: "Set timeline media playback",
  description: "Set volume, speed, mute, and looping for a local audio or video timeline item.",
  inputSchema: { localProjectId: z.string().uuid(), timelineItemId: z.string().uuid(), volume: z.number().min(0).max(1).optional(), playbackRate: z.number().min(.25).max(4).optional(), muted: z.boolean().optional(), loop: z.boolean().optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, timelineItemId, volume, playbackRate, muted, loop, expectedRevision }) => { try { const patch = { ...(volume === undefined ? {} : { volume }), ...(playbackRate === undefined ? {} : { playbackRate }), ...(muted === undefined ? {} : { muted }), ...(loop === undefined ? {} : { loop }) }; return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "update-timeline-items", edits: [{ itemId: timelineItemId, patch }] }], summary: "Updated timeline media playback" })); } catch (error) { return toolError(error); } });

server.registerTool("split_timeline_item", {
  title: "Split timeline item",
  description: "Split one authored timeline item at an exact project time while preserving media source offset, playback settings, and edge motion.",
  inputSchema: { localProjectId: z.string().uuid(), timelineItemId: z.string().uuid(), atSeconds: z.number().min(0), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, timelineItemId, atSeconds, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "split-timeline-item", itemId: timelineItemId, atSeconds }], summary: "Split timeline item" })); } catch (error) { return toolError(error); } });

server.registerTool("set_project_caption_animation", {
  title: "Set caption animation",
  description: "Choose the project-wide seek-safe caption motion preset and duration.",
  inputSchema: { localProjectId: z.string().uuid(), preset: z.enum(["none", "pop", "word-reveal", "karaoke", "bounce"]), durationSeconds: z.number().min(0).max(3).default(.2), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, preset, durationSeconds, expectedRevision }) => { try { return result(projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands: [{ kind: "set-caption-animation", patch: { preset, durationSeconds } }], summary: "Updated caption animation" })); } catch (error) { return toolError(error); } });

server.registerTool("create_project", {
  title: "Create a local project",
  description: "Create a supported Dialogue project. Reddit Story and Fake Text remain experimental and require DIALOGUELAB_ENABLE_EXPERIMENTAL_PROJECTS=1.",
  inputSchema: { name: z.string().min(1).max(100), description: z.string().max(500).default(""), projectType: z.enum(["dialogue", "reddit-story", "fake-text"]).default("dialogue"), width: z.number().int().min(240).max(8192).default(1080), height: z.number().int().min(240).max(8192).default(1920), fps: z.number().int().min(1).max(120).default(30) },
}, async (input) => { try { return result({ project: projectService.create(input) }); } catch (error) { return toolError(error); } });

server.registerTool("update_project", {
  title: "Update a local project",
  description: "Update project metadata and/or replace its versioned editor state. This is the shared state mutation surface for AI-assisted editing.",
  inputSchema: { localProjectId: z.string().uuid(), name: z.string().min(1).max(100).optional(), description: z.string().max(500).optional(), editorState: editorStateSchema.optional(), expectedRevision: z.number().int().min(0).optional() },
}, async (input) => { try { return result({ project: projectService.update(input) }); } catch (error) { return toolError(error); } });

server.registerTool("remove_project", {
  title: "Remove a local project",
  description: "Permanently remove a project record and its editor state. Shared voice, character, and background libraries remain untouched.",
  inputSchema: { localProjectId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ localProjectId }) => { try { projectService.remove(localProjectId); return result({ ok: true }); } catch (error) { return toolError(error); } });

server.registerTool("configure_project_stage", {
  title: "Configure a project's dialogue stage",
  description: "Set the reusable background, its media offset, and cast for a project. Existing dialogue lines and their timings are preserved.",
  inputSchema: { localProjectId: z.string().uuid(), localBackgroundId: z.string().uuid().nullable().optional(), backgroundStartSeconds: z.number().min(0).optional(), localCharacterIds: z.array(z.string().uuid()).max(30).optional() },
}, async ({ localProjectId, localBackgroundId, backgroundStartSeconds, localCharacterIds }) => {
  try {
    const command: ProjectCommand = { kind: "configure-stage" };
    if (localBackgroundId !== undefined) command.backgroundId = localBackgroundId ?? "";
    if (backgroundStartSeconds !== undefined) command.backgroundStartSeconds = backgroundStartSeconds;
    if (localCharacterIds !== undefined) command.characterIds = [...new Set(localCharacterIds)];
    return result(projectCommandService.apply({ localProjectId, source: "mcp", commands: [command], summary: "Configured project stage" }));
  } catch (error) { return toolError(error); }
});

server.registerTool("add_dialogue_line", {
  title: "Add a dialogue line",
  description: "Add an editable character line to a project. The character is automatically added to the cast and the synchronized preview tracks are recompiled.",
  inputSchema: { localProjectId: z.string().uuid(), localCharacterId: z.string().uuid(), localCharacterImageId: z.string().uuid().optional(), text: z.string().min(1).max(5000), position: z.enum(["left", "center", "right"]).default("center"), gapAfterSeconds: z.number().min(0).max(10).default(0.25), order: z.number().int().min(0).optional() },
}, async ({ localProjectId, localCharacterId, localCharacterImageId, text, position, gapAfterSeconds, order }) => {
  try {
    const project = projectService.get(localProjectId); const character = requireCharacter(localCharacterId);
    const image = localCharacterImageId ? character.images.find((item) => item.id === localCharacterImageId) : character.images[0];
    if (!image) throw new Error("The selected image does not belong to this character.");
    const existing = dialogueBlocks(project.editorState); const before = new Set(existing.map((line) => line.id));
    const commands: ProjectCommand[] = [];
    if (!project.editorState.assets.characterIds.includes(character.id)) commands.push({ kind: "configure-stage", characterIds: [...project.editorState.assets.characterIds, character.id] });
    commands.push({ kind: "add-dialogue-line", line: { characterId: character.id, characterImageId: image.id, text: text.trim(), position, gapAfterSeconds, speechSpeed: "fast", hideSubtitles: false } });
    let applied = projectCommandService.apply({ localProjectId, source: "mcp", commands, summary: "Added dialogue line" });
    const line = dialogueBlocks(applied.project.editorState).find((item) => !before.has(item.id))!;
    if (order !== undefined && order < existing.length) { const ids = dialogueBlocks(applied.project.editorState).map((item) => item.id).filter((id) => id !== line.id); ids.splice(order, 0, line.id); applied = projectCommandService.apply({ localProjectId, source: "mcp", commands: [{ kind: "reorder-dialogue-lines", lineIds: ids }], summary: "Placed dialogue line" }); }
    return result({ ...applied, line: dialogueBlocks(applied.project.editorState).find((item) => item.id === line.id) });
  } catch (error) { return toolError(error); }
});

server.registerTool("update_dialogue_line", {
  title: "Update or reorder a dialogue line",
  description: "Edit a line's text, speaker, pose, placement, subtitle visibility, gap, or order. Changing text or speaker clears stale generated speech.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), localCharacterId: z.string().uuid().optional(), localCharacterImageId: z.string().uuid().optional(), text: z.string().min(1).max(5000).optional(), position: z.enum(["left", "center", "right"]).optional(), speechSpeed: z.enum(["slow", "normal", "fast"]).optional(), gapAfterSeconds: z.number().min(0).max(10).optional(), hideSubtitles: z.boolean().optional(), order: z.number().int().min(0).optional(), expectedRevision: z.number().int().min(0).optional() },
}, async ({ localProjectId, lineId, localCharacterId, localCharacterImageId, text, position, speechSpeed, gapAfterSeconds, hideSubtitles, order, expectedRevision }) => {
  try {
    const { project, line } = requireDialogueLine(localProjectId, lineId); const character = requireCharacter(localCharacterId ?? line.data.characterId);
    const imageId = localCharacterImageId ?? (localCharacterId ? character.images[0]?.id : line.data.characterImageId);
    if (!imageId || !character.images.some((item) => item.id === imageId)) throw new Error("The selected image does not belong to this character.");
    const commands: ProjectCommand[] = [];
    if (!project.editorState.assets.characterIds.includes(character.id)) commands.push({ kind: "configure-stage", characterIds: [...project.editorState.assets.characterIds, character.id] });
    commands.push({ kind: "update-dialogue-line", lineId, patch: { characterId: character.id, characterImageId: imageId,
      ...(text === undefined ? {} : { text: text.trim() }), ...(position === undefined ? {} : { position }), ...(speechSpeed === undefined ? {} : { speechSpeed }),
      ...(gapAfterSeconds === undefined ? {} : { gapAfterSeconds }), ...(hideSubtitles === undefined ? {} : { hideSubtitles }) } });
    let applied = projectCommandService.apply({ localProjectId, expectedRevision, source: "mcp", commands, summary: "Updated dialogue line" });
    if (order !== undefined) { const ids = dialogueBlocks(applied.project.editorState).map((item) => item.id).filter((id) => id !== lineId); ids.splice(Math.min(order, ids.length), 0, lineId); applied = projectCommandService.apply({ localProjectId, source: "mcp", commands: [{ kind: "reorder-dialogue-lines", lineIds: ids }], summary: "Reordered dialogue line" }); }
    return result({ ...applied, line: dialogueBlocks(applied.project.editorState).find((item) => item.id === lineId) });
  } catch (error) { return toolError(error); }
});

server.registerTool("remove_dialogue_line", {
  title: "Remove a dialogue line",
  description: "Remove one editable dialogue line and recompile project timing. Generated speech remains in the local audio library for reuse.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ localProjectId, lineId }) => {
  try {
    requireDialogueLine(localProjectId, lineId); return result(projectCommandService.apply({ localProjectId, source: "mcp", commands: [{ kind: "remove-dialogue-line", lineId }], summary: "Removed dialogue line" }));
  } catch (error) { return toolError(error); }
});

server.registerTool("generate_dialogue_line_audio", {
  title: "Generate and attach dialogue audio",
  description: "Generate TTS with the line character's assigned voice, attach exact measured audio duration and word timings, then recompile synchronized character, audio, and subtitle tracks.",
  inputSchema: { localProjectId: z.string().uuid(), lineId: z.string().uuid(), speed: z.enum(["slow", "normal", "fast"]).default("normal"), language: z.string().min(2).optional() }, annotations: { openWorldHint: true },
}, async ({ localProjectId, lineId, speed, language }) => {
  try { return result(await generateAttachedDialogueAudio(localProjectId, lineId, speed, language)); } catch (error) { return toolError(error); }
});

server.registerTool("generate_dialogue_audio_batch", {
  title: "Generate dialogue audio in a batch",
  description: "Generate and attach TTS sequentially for all or only missing dialogue lines. Failures are returned per line without discarding successful work; retry by passing failed lineIds.",
  inputSchema: { localProjectId: z.string().uuid(), mode: z.enum(["missing", "all"]).default("missing"), lineIds: z.array(z.string().uuid()).min(1).max(10_000).optional(), language: z.string().min(2).optional() }, annotations: { openWorldHint: true },
}, async ({ localProjectId, mode, lineIds, language }) => {
  try {
    const project = projectService.get(localProjectId); const lines = dialogueBlocks(project.editorState); const speechIds = new Set(speechService.list().map((clip) => clip.id)); const requested = lineIds ? new Set(lineIds) : undefined;
    if (requested) { const known = new Set(lines.map((line) => line.id)); const missing = [...requested].filter((id) => !known.has(id)); if (missing.length) throw new Error(`Dialogue line not found: ${missing.join(", ")}`); }
    const targets = lines.filter((line) => requested?.has(line.id) || !requested && (mode === "all" || !line.data.speechClipId || !speechIds.has(line.data.speechClipId)));
    const tasks: Array<{ lineId: string; lineNumber: number; status: "success" | "error"; clipId?: string; error?: string }> = [];
    for (const line of targets) {
      try { const generated = await generateAttachedDialogueAudio(localProjectId, line.id, undefined, language); tasks.push({ lineId: line.id, lineNumber: lines.findIndex((item) => item.id === line.id) + 1, status: "success", clipId: generated.clip.id }); }
      catch (error) { tasks.push({ lineId: line.id, lineNumber: lines.findIndex((item) => item.id === line.id) + 1, status: "error", error: error instanceof Error ? error.message : String(error) }); }
    }
    return result({ requested: targets.length, succeeded: tasks.filter((task) => task.status === "success").length, failed: tasks.filter((task) => task.status === "error").length, tasks, ...projectCommandService.timeline(localProjectId) });
  } catch (error) { return toolError(error); }
});

server.registerTool("render_project", {
  title: "Render a project locally",
  description: "Queue a persistent HyperFrames MP4 render entirely on this computer. Returns immediately with a render job; poll get_render_job until complete.",
  inputSchema: { localProjectId: z.string().uuid(), quality: z.enum(["draft", "standard", "high"]).default("standard") },
}, async ({ localProjectId, quality }) => {
  try { return result({ render: renderService.start(localProjectId, quality) }); }
  catch (error) { return toolError(error); }
});

server.registerTool("get_render_job", {
  title: "Get a local render job",
  description: "Get persistent status, stage, progress, error details, and the local video URL for one render job.",
  inputSchema: { renderId: z.string().uuid() }, annotations: { readOnlyHint: true },
}, async ({ renderId }) => { const render = renderService.get(renderId); return render ? result({ render }) : toolError(new Error("Render job not found.")); });

server.registerTool("list_render_jobs", {
  title: "List local render jobs",
  description: "List persistent render history for one project, including queued, active, completed, failed, and cancelled jobs.",
  inputSchema: { localProjectId: z.string().uuid() }, annotations: { readOnlyHint: true },
}, async ({ localProjectId }) => result({ renders: renderService.list(localProjectId) }));

server.registerTool("cancel_render_job", {
  title: "Cancel a local render job", description: "Cancel a queued or active local render.", inputSchema: { renderId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ renderId }) => { try { return result({ render: renderService.cancel(renderId) }); } catch (error) { return toolError(error); } });

server.registerTool("retry_render_job", {
  title: "Retry a local render job", description: "Create a new persistent render job from the same frozen project revision as a failed or cancelled render.", inputSchema: { renderId: z.string().uuid() },
}, async ({ renderId }) => { try { return result({ render: renderService.retry(renderId) }); } catch (error) { return toolError(error); } });

server.registerTool("remove_render_job", {
  title: "Remove a local render", description: "Remove a terminal render history record and its managed MP4 file.", inputSchema: { renderId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ renderId }) => { try { await renderService.remove(renderId); return result({ ok: true }); } catch (error) { return toolError(error); } });

server.registerTool("configure_voice_provider", {
  title: "Configure a voice provider",
  description: "Validate and securely store an ElevenLabs, MiniMax, or Fish Audio API key in the local DialogueLab database. Never returns the key.",
  inputSchema: { provider: cloudProviderSchema, apiKey: z.string().min(8) },
}, async ({ provider, apiKey }) => {
  try { assertProvider(provider); return result({ providers: await providerService.configure(provider, apiKey) }); }
  catch (error) { return toolError(error); }
});

server.registerTool("disconnect_voice_provider", {
  title: "Disconnect a voice provider",
  description: "Remove a stored provider credential. Local voice records remain intact.",
  inputSchema: { provider: providerSchema }, annotations: { destructiveHint: true },
}, async ({ provider }) => {
  try { assertProvider(provider); return result({ providers: providerService.disconnect(provider) }); }
  catch (error) { return toolError(error); }
});

server.registerTool("list_voices", {
  title: "List local voices",
  description: "List every voice saved in the local DialogueLab voice library.",
  inputSchema: { provider: providerSchema.optional(), search: z.string().optional() }, annotations: { readOnlyHint: true },
}, async ({ provider, search }) => {
  const query = search?.toLowerCase();
  const voices = voiceService.list().filter((voice) => (!provider || voice.provider === provider) && (!query || `${voice.name} ${voice.description}`.toLowerCase().includes(query)));
  return result({ voices });
});

server.registerTool("list_characters", {
  title: "List local characters",
  description: "List characters, their assigned local voices, images, and configured image dimensions in DialogueLab.",
  inputSchema: { search: z.string().optional() }, annotations: { readOnlyHint: true },
}, async ({ search }) => {
  const query = search?.toLowerCase(); const characters = characterService.list().filter((character) => !query || `${character.name} ${character.description} ${character.voiceName}`.toLowerCase().includes(query));
  return result({ characters });
});

server.registerTool("create_character", {
  title: "Create a local character",
  description: "Create a DialogueLab character from one or more local JPG, PNG, or WebP files and assign a voice from list_voices. Agents may generate and background-remove images first, then pass the resulting local paths here.",
  inputSchema: {
    name: z.string().min(1).max(80), description: z.string().default(""), voiceId: z.string().uuid(),
    images: z.array(z.object({ imagePath: z.string().min(1), label: z.string().min(1), width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) })).min(1).max(20),
  },
}, async ({ name, description, voiceId, images }) => {
  try {
    const uploads: CharacterImageUpload[] = await Promise.all(images.map(async ({ imagePath, label, width, height }) => ({
      ...await imageUpload(imagePath), label, width, height,
    })));
    return result({ character: characterService.create({ name, description, voiceId, images: uploads }) });
  } catch (error) { return toolError(error); }
});

server.registerTool("update_character", {
  title: "Update a local character",
  description: "Edit a character's name, description, assigned voice, image labels, or rendered image dimensions. Existing local artwork is preserved.",
  inputSchema: {
    localCharacterId: z.string().uuid(),
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).optional(),
    voiceId: z.string().uuid().optional(),
    images: z.array(z.object({
      localCharacterImageId: z.string().uuid(),
      label: z.string().min(1).optional(),
      width: z.number().int().min(1).max(4096).optional(),
      height: z.number().int().min(1).max(4096).optional(),
    })).max(20).optional(),
  },
}, async ({ localCharacterId, name, description, voiceId, images }) => {
  try {
    const character = requireCharacter(localCharacterId);
    const overrides = new Map((images ?? []).map((image) => [image.localCharacterImageId, image]));
    for (const imageId of overrides.keys()) if (!character.images.some((image) => image.id === imageId)) throw new Error("The selected image does not belong to this character.");
    return result({ character: characterService.update({
      localCharacterId,
      name: name ?? character.name,
      description: description ?? character.description,
      voiceId: voiceId ?? character.voiceId,
      existingImages: character.images.map((image) => {
        const override = overrides.get(image.id);
        return { id: image.id, label: override?.label ?? image.label, width: override?.width ?? image.width, height: override?.height ?? image.height };
      }),
      newImages: [],
    }) });
  } catch (error) { return toolError(error); }
});

server.registerTool("remove_character", {
  title: "Remove a local character",
  description: "Remove a character and its locally stored images. The assigned voice remains in the voice library.",
  inputSchema: { localCharacterId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ localCharacterId }) => {
  try { characterService.remove(localCharacterId); return result({ ok: true }); }
  catch (error) { return toolError(error); }
});

server.registerTool("list_backgrounds", {
  title: "List local video backgrounds",
  description: "List video backgrounds stored by DialogueLab, including local stream URLs, dimensions, duration, and file size.",
  inputSchema: { search: z.string().optional() }, annotations: { readOnlyHint: true },
}, async ({ search }) => {
  const query = search?.toLowerCase(); const backgrounds = backgroundService.list().filter((background) =>
    !query || `${background.name} ${background.description} ${background.fileName}`.toLowerCase().includes(query));
  return result({ backgrounds });
});

server.registerTool("add_background_video", {
  title: "Add a local video background",
  description: "Copy an MP4, WebM, or MOV file into DialogueLab's managed local background library. Video metadata is detected locally with ffprobe.",
  inputSchema: { videoPath: z.string().min(1), name: z.string().min(1).max(100).optional(), description: z.string().default("") },
}, async ({ videoPath, name, description }) => {
  try {
    const path = resolve(videoPath); const extension = extname(path).toLowerCase();
    const mimeType = extension === ".mp4" ? "video/mp4" : extension === ".webm" ? "video/webm" : extension === ".mov" ? "video/quicktime" : undefined;
    if (!mimeType) throw new Error("Background videos must be MP4, WebM, or MOV files.");
    const metadata = await probeVideo(path); const fileName = path.split(/[\\/]/).pop() || `background${extension}`;
    const background = await backgroundService.importFile({ videoPath: path, fileName, mimeType,
      name: name || fileName.replace(/\.[^.]+$/, ""), description, ...metadata });
    return result({ background });
  } catch (error) { return toolError(error); }
});

server.registerTool("update_background", {
  title: "Update a local background",
  description: "Rename a background or edit its local description without changing the managed video or project references.",
  inputSchema: { localBackgroundId: z.string().uuid(), name: z.string().min(1).max(100), description: z.string().max(500).default("") },
}, async ({ localBackgroundId, name, description }) => {
  try { return result({ background: backgroundService.update({ localBackgroundId, name, description }) }); }
  catch (error) { return toolError(error); }
});

server.registerTool("list_fonts", {
  title: "List offline caption fonts", description: "List bundled and user-imported fonts available to local HyperFrames previews and renders.",
  inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => result({ fonts: fontService.list() }));

server.registerTool("import_font", {
  title: "Import an offline font", description: "Copy a local WOFF2, WOFF, TTF, or OTF file into DialogueLab's managed offline font library.",
  inputSchema: { family: z.string().min(1).max(80), fontPath: z.string().min(1) },
}, async ({ family, fontPath }) => { try { return result({ font: await fontService.importFile({ family, path: resolve(fontPath) }) }); } catch (error) { return toolError(error); } });

server.registerTool("remove_font", {
  title: "Remove an imported font", description: "Remove an unused user-imported font from the local library. Bundled fonts cannot be removed.",
  inputSchema: { localFontId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ localFontId }) => { try { await fontService.remove(localFontId); return result({ ok: true }); } catch (error) { return toolError(error); } });

server.registerTool("remove_background", {
  title: "Remove a local video background",
  description: "Remove a background record and its managed local video copy.",
  inputSchema: { localBackgroundId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ localBackgroundId }) => {
  try { await backgroundService.remove(localBackgroundId); return result({ ok: true }); }
  catch (error) { return toolError(error); }
});

server.registerTool("list_speech_clips", {
  title: "List generated speech clips",
  description: "List locally generated TTS audio with source voice, transcript, duration, speed, and word timing data.",
  inputSchema: { voiceId: z.string().uuid().optional() }, annotations: { readOnlyHint: true },
}, async ({ voiceId }) => {
  try { return result({ clips: speechService.list(voiceId).map((clip) => ({ ...clip, audioPath: speechService.file(clip.id)?.path })) }); }
  catch (error) { return toolError(error); }
});

server.registerTool("get_subtitle_engine_status", {
  title: "Get local subtitle engine status",
  description: "Show whether the app-managed faster-whisper runtime and multilingual model are ready for local word-timed subtitles.",
  inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => result({ subtitleEngine: subtitleEngineService.status() }));

server.registerTool("install_subtitle_engine", {
  title: "Install local Whisper subtitles",
  description: "Install faster-whisper and its multilingual model in an isolated app-managed runtime. Returns immediately; poll get_subtitle_engine_status for completion.",
  inputSchema: {}, annotations: { openWorldHint: true },
}, async () => {
  try { return result({ subtitleEngine: subtitleEngineService.install() }); }
  catch (error) { return toolError(error); }
});

server.registerTool("generate_speech", {
  title: "Generate speech from a local voice",
  description: "Generate TTS for a voice returned by list_voices. Audio and timing metadata are persisted locally for dialogue editing and rendering.",
  inputSchema: { voiceId: z.string().uuid(), text: z.string().min(1).max(5000), speed: z.enum(["slow", "normal", "fast"]).default("fast"), language: z.string().min(2).optional() },
  annotations: { openWorldHint: true },
}, async ({ voiceId, text, speed, language }) => {
  try { const clip = await speechService.generate({ voiceId, text, speed, language }); return result({ clip: { ...clip, audioPath: speechService.file(clip.id)?.path } }); }
  catch (error) { return toolError(error); }
});

server.registerTool("remove_speech_clip", {
  title: "Remove generated speech",
  description: "Remove a generated speech record and its managed local audio file.",
  inputSchema: { localSpeechId: z.string().uuid() }, annotations: { destructiveHint: true },
}, async ({ localSpeechId }) => {
  try { await speechService.remove(localSpeechId); return result({ ok: true }); }
  catch (error) { return toolError(error); }
});

server.registerTool("list_provider_voices", {
  title: "List provider voices",
  description: "List voices available in a connected provider account before adding one locally.",
  inputSchema: { provider: providerSchema }, annotations: { readOnlyHint: true, openWorldHint: true },
}, async ({ provider }) => {
  try { assertProvider(provider); return result({ voices: await voiceService.listRemote(provider) }); }
  catch (error) { return toolError(error); }
});

server.registerTool("update_voice", {
  title: "Update a local voice",
  description: "Change the display name and/or local artwork for a voice in the DialogueLab library. Artwork stays local and is not uploaded to the provider.",
  inputSchema: { localVoiceId: z.string().uuid(), name: z.string().min(1).max(80).optional(), imagePath: z.string().min(1).optional() },
}, async ({ localVoiceId, name, imagePath }) => {
  try {
    if (name === undefined && imagePath === undefined) throw new Error("Provide a new name, an image path, or both.");
    const image = imagePath ? await imageUpload(imagePath) : undefined;
    return result({ voice: voiceService.update({ localVoiceId, name, image }) });
  } catch (error) { return toolError(error); }
});

server.registerTool("add_existing_voice", {
  title: "Add an existing provider voice",
  description: "Add a voice already present in the connected provider account to the local library. The provider voice is not duplicated.",
  inputSchema: { provider: providerSchema, providerVoiceId: z.string().min(1), name: z.string().optional(), description: z.string().optional() },
}, async ({ provider, providerVoiceId, name, description }) => {
  try {
    assertProvider(provider);
    const remote = (await voiceService.listRemote(provider)).find((voice) => voice.providerVoiceId === providerVoiceId);
    if (!remote) throw new Error("That voice ID was not found in the connected provider account.");
    return result({ voice: voiceService.link({ voice: { ...remote, name: name || remote.name, description: description || remote.description } }) });
  } catch (error) { return toolError(error); }
});

server.registerTool("clone_voice_from_file", {
  title: "Clone a voice from an audio file",
  description: "Create a provider voice clone from a local MP3, M4A, or WAV file. Explicit speaker permission is required.",
  inputSchema: { provider: providerSchema, audioPath: z.string().min(1), name: z.string().min(1), description: z.string().default(""),
    speakerPermissionConfirmed: z.literal(true), removeBackgroundNoise: z.boolean().default(true), previewText: z.string().max(1000).optional() },
  annotations: { openWorldHint: true },
}, async ({ provider, audioPath, name, description, removeBackgroundNoise, previewText }) => {
  try {
    assertProvider(provider); const path = resolve(audioPath); const bytes = new Uint8Array(await readFile(path));
    const extension = extname(path).toLowerCase(); const mimeType = extension === ".wav" ? "audio/wav" : extension === ".m4a" ? "audio/mp4" : "audio/mpeg";
    return result({ voice: await voiceService.clone({ provider, name, description, audio: { name: path.split(/[\\/]/).pop() || "voice.mp3", mimeType, bytes }, removeBackgroundNoise, previewText }) });
  } catch (error) { return toolError(error); }
});

server.registerTool("design_voice", {
  title: "Design a new voice",
  description: "Generate voice previews from a description. Use save_designed_voice with the chosen preview ID to add it to the library.",
  inputSchema: { provider: providerSchema, prompt: z.string().min(20), previewText: z.string().min(1).max(1000) },
  annotations: { openWorldHint: true },
}, async ({ provider, prompt, previewText }) => {
  try {
    assertProvider(provider); const previews = await voiceService.design({ provider, prompt, previewText });
    const directory = join(process.env.DIALOGUELAB_DATA_DIR || join(process.cwd(), "data"), "previews"); await mkdir(directory, { recursive: true });
    const output = await Promise.all(previews.map(async (preview, index) => {
      pendingPreviews.set(preview.id, preview); const match = /^data:([^;]+);base64,(.+)$/.exec(preview.audioUrl);
      let audioPath: string | undefined;
      if (match) { audioPath = join(directory, `${preview.id}.mp3`); await writeFile(audioPath, Buffer.from(match[2], "base64")); }
      return { previewId: preview.id, option: index + 1, audioPath, expiresAt: preview.expiresAt };
    }));
    return result({ previews: output, next: "Play the audio files, then call save_designed_voice with the chosen previewId." });
  } catch (error) { return toolError(error); }
});

server.registerTool("save_designed_voice", {
  title: "Save a designed voice",
  description: "Save a previously generated design preview into the local and provider voice library.",
  inputSchema: { previewId: z.string().uuid(), name: z.string().min(1), description: z.string().min(20) },
  annotations: { openWorldHint: true },
}, async ({ previewId, name, description }) => {
  try {
    const preview = pendingPreviews.get(previewId); if (!preview) throw new Error("Preview is not available in this MCP session. Generate it again first.");
    const voice = await voiceService.saveDesign({ provider: preview.provider as ProviderId, preview, name, description }); pendingPreviews.delete(previewId);
    return result({ voice });
  } catch (error) { return toolError(error); }
});

async function probeVideo(path: string): Promise<{ width: number; height: number; durationSeconds: number }> {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", path], { maxBuffer: 1024 * 1024 });
    const output = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } }; const stream = output.streams?.[0];
    const width = Number(stream?.width); const height = Number(stream?.height); const durationSeconds = Number(output.format?.duration);
    if (!width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("ffprobe did not return valid video metadata.");
    return { width, height, durationSeconds };
  } catch (error) { throw new Error(`Could not inspect the local video with ffprobe: ${error instanceof Error ? error.message : String(error)}`); }
}

async function probeMedia(path: string): Promise<{ mimeType: string; width: number; height: number; durationSeconds: number }> {
  const extension = extname(path).toLowerCase(); const mimeType = new Map([
    [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"],
    [".wav", "audio/wav"], [".mp3", "audio/mpeg"], [".ogg", "audio/ogg"], [".m4a", "audio/mp4"],
  ]).get(extension); if (!mimeType) throw new Error("Unsupported media file extension.");
  try { const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", path], { maxBuffer: 1024 * 1024 });
    const value = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }>; format?: { duration?: string } }; const video = value.streams?.find((stream) => stream.codec_type === "video");
    const isImage = mimeType.startsWith("image/"); const width = Number(video?.width || 0); const height = Number(video?.height || 0); const durationSeconds = isImage ? 0 : Number(value.format?.duration);
    if ((mimeType.startsWith("image/") || mimeType.startsWith("video/")) && (!width || !height)) throw new Error("ffprobe did not return valid dimensions."); if (!isImage && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) throw new Error("ffprobe did not return a valid duration.");
    return { mimeType, width, height, durationSeconds };
  } catch (error) { throw new Error(`Could not inspect the local media with ffprobe: ${error instanceof Error ? error.message : String(error)}`); }
}

const transport = new StdioServerTransport();
await server.connect(transport);
