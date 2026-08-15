import type {
  ApplyProjectCommandsInput, DialogueLineData, ProjectCommand, ProjectCommandResult, ProjectEditorState, ProjectHistoryEntry,
  ProjectAuthoredTimelineItem, ProjectAuthoredTrack, ProjectElementTransform, ProjectTimelineWindow, ProjectValidationIssue,
} from "@/shared/contracts";
import { compileDialogueTimeline, compileFakeTextTimeline, DEFAULT_PROJECT_MOTION, DEFAULT_PROJECT_TRANSFORM, DEFAULT_SCENE_TRANSITION, defaultDialogueCharacterTransform, dialogueBlocks, fakeTextBlocks, normalizeCaptionAnimation, normalizeCaptionStyle, normalizeFakeTextSettings, normalizeProjectMotion, normalizeSceneTransition, normalizeTransform, PROJECT_MOTION_PRESETS, resolveDialoguePerformanceCues } from "@/shared/project-timeline";
import { backgroundRepository } from "./background-repository";
import { characterRepository } from "./character-repository";
import { db } from "./database";
import { projectRepository } from "./project-repository";
import { speechRepository } from "./speech-repository";
import { mediaRepository } from "./media-repository";
import { validateCaptionStyle, validateProjectState } from "./project-validation";

export class ProjectRevisionConflict extends Error {
  readonly code = "REVISION_CONFLICT";
  constructor(readonly currentRevision: number) { super(`Project changed in another editor. Current revision is ${currentRevision}.`); }
}

export const projectCommandService = {
  timeline(localProjectId: string): ProjectCommandResult { return resultFor(requireProject(localProjectId)); },

  apply(input: ApplyProjectCommandsInput): ProjectCommandResult {
    if (!input.commands.length || input.commands.length > 100) throw new Error("Apply between 1 and 100 project edits at once.");
    const current = requireProject(input.localProjectId); assertRevision(current.revision, input.expectedRevision);
    let state = structuredClone(current.editorState);
    for (const command of input.commands) state = applyCommand(state, command);
    state = validateAndCompile(state);
    const summary = input.summary?.trim().slice(0, 200) || summarize(input.commands);
    commitState(current.id, current.revision, state, input.source ?? "ui", input.commands.length === 1 ? input.commands[0].kind : "batch", summary);
    return resultFor(requireProject(current.id));
  },

  undo(localProjectId: string, expectedRevision?: number): ProjectCommandResult { return moveHistory(localProjectId, -1, expectedRevision); },
  redo(localProjectId: string, expectedRevision?: number): ProjectCommandResult { return moveHistory(localProjectId, 1, expectedRevision); },

  history(localProjectId: string, limit = 50): ProjectHistoryEntry[] {
    requireProject(localProjectId); const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const row = db().prepare("SELECT history_cursor FROM projects WHERE id = ?").get(localProjectId) as unknown as { history_cursor: number };
    const entries = db().prepare(`SELECT sequence, revision, source, command_kind, summary, created_at FROM project_history
      WHERE project_id = ? ORDER BY sequence DESC LIMIT ?`).all(localProjectId, safeLimit) as unknown as Array<{
        sequence: number; revision: number; source: ProjectHistoryEntry["source"]; command_kind: string; summary: string; created_at: string;
      }>;
    return entries.map((entry) => ({ sequence: entry.sequence, revision: entry.revision, source: entry.source, commandKind: entry.command_kind,
      summary: entry.summary, createdAt: entry.created_at, current: entry.sequence === row.history_cursor }));
  },
};

function applyCommand(state: ProjectEditorState, command: ProjectCommand): ProjectEditorState {
  switch (command.kind) {
    case "add-fake-text-message": {
      requireFakeTextProject(state); const messages = fakeTextBlocks(state); const afterIndex = command.afterMessageId ? messages.findIndex((message) => message.id === command.afterMessageId) : messages.length - 1;
      if (command.afterMessageId && afterIndex < 0) throw new Error("Fake Text message not found.");
      const side = command.message?.side === "incoming" || command.message?.side === "outgoing" ? command.message.side : messages.at(-1)?.data.side === "incoming" ? "outgoing" : "incoming";
      const data = validateFakeTextMessage({ side, text: command.message?.text ?? "", sender: command.message?.sender ?? (side === "outgoing" ? "You" : "Alex") });
      const insertOrder = afterIndex + 1; const shifted = state.blocks.map((block) => block.kind === "fake-text-message" && block.order >= insertOrder ? { ...block, order: block.order + 1 } : block);
      return { ...state, blocks: [...shifted, { id: crypto.randomUUID(), kind: "fake-text-message", order: insertOrder, data }] };
    }
    case "update-fake-text-message": {
      requireFakeTextProject(state); const message = requireFakeTextMessage(state, command.messageId); const data = validateFakeTextMessage({ ...message.data, ...command.patch });
      return { ...state, blocks: state.blocks.map((block) => block.id === message.id ? { ...block, data } : block) };
    }
    case "duplicate-fake-text-message": {
      const message = requireFakeTextMessage(state, command.messageId); return applyCommand(state, { kind: "add-fake-text-message", message: structuredClone(message.data), afterMessageId: message.id });
    }
    case "remove-fake-text-message": {
      requireFakeTextProject(state); requireFakeTextMessage(state, command.messageId); return reorderFakeText({ ...state, blocks: state.blocks.filter((block) => block.id !== command.messageId) });
    }
    case "reorder-fake-text-messages": {
      requireFakeTextProject(state); const messages = fakeTextBlocks(state); const existing = new Set(messages.map((message) => message.id));
      if (command.messageIds.length !== messages.length || new Set(command.messageIds).size !== messages.length || command.messageIds.some((id) => !existing.has(id))) throw new Error("Provide every Fake Text message ID exactly once.");
      const order = new Map(command.messageIds.map((id, index) => [id, index])); return { ...state, blocks: state.blocks.map((block) => order.has(block.id) ? { ...block, order: order.get(block.id)! } : block) };
    }
    case "set-fake-text-settings": {
      requireFakeTextProject(state); const settings = normalizeFakeTextSettings({ ...state.fakeText, ...command.patch }); validateFakeTextSettings(settings); return { ...state, fakeText: settings };
    }
    case "configure-stage": {
      if (command.backgroundId && !backgroundRepository.get(command.backgroundId)) throw new Error("Background not found.");
      const characterIds = command.characterIds ?? state.assets.characterIds;
      if (new Set(characterIds).size !== characterIds.length || characterIds.some((id) => !characterRepository.get(id))) throw new Error("One or more selected characters could not be found.");
      const used = [...dialogueBlocks(state).map((line) => line.data.characterId).filter(Boolean), ...state.timeline.items.filter((item) => item.kind === "character-pose").map((item) => item.characterId).filter((id): id is string => Boolean(id))];
      if (used.some((id) => !characterIds.includes(id))) throw new Error("The cast must include every character used by a dialogue line.");
      return { ...state, assets: { backgroundId: command.backgroundId === undefined ? state.assets.backgroundId : command.backgroundId || undefined,
        backgroundStartSeconds: command.backgroundStartSeconds === undefined ? state.assets.backgroundStartSeconds : nonNegative(command.backgroundStartSeconds, "Background offset"), characterIds } };
    }
    case "add-dialogue-line": {
      const cast = state.assets.characterIds.map((id) => characterRepository.get(id)).filter(Boolean);
      const character = command.line?.characterId ? characterRepository.get(command.line.characterId) : cast[0];
      if (!character || !state.assets.characterIds.includes(character.id) || !character.images.length) throw new Error("Choose a project character with at least one pose.");
      const data: DialogueLineData = {
        characterId: character.id, characterImageId: command.line?.characterImageId ?? character.images[0].id,
        text: command.line?.text ?? "", position: command.line?.position ?? (dialogueBlocks(state).length % 2 ? "right" : "left"),
        speechSpeed: command.line?.speechSpeed ?? "fast", speechClipId: command.line?.speechClipId,
        gapAfterSeconds: command.line?.gapAfterSeconds ?? 0.35, hideSubtitles: command.line?.hideSubtitles ?? false,
      };
      validateLine(state, data); const lines = dialogueBlocks(state); const afterIndex = command.afterLineId ? lines.findIndex((line) => line.id === command.afterLineId) : lines.length - 1;
      if (command.afterLineId && afterIndex < 0) throw new Error("Dialogue line not found.");
      const insertOrder = afterIndex + 1; const shifted = state.blocks.map((block) => block.kind === "dialogue-line" && block.order >= insertOrder ? { ...block, order: block.order + 1 } : block); const id = crypto.randomUUID();
      const sourceDuration = data.speechClipId ? speechRepository.get(data.speechClipId)?.durationSeconds : undefined; const durationSeconds = sourceDuration ?? Math.max(.8, (data.text.match(/\S+/g)?.length ?? 1) / 2.5);
      const timeline = state.timeline.mode === "manual" ? { startSeconds: compileDialogueTimeline(state, speechRepository.list()).durationSeconds, durationSeconds, sourceStartSeconds: 0, linkGroupId: id, locked: false } : undefined;
      return { ...state, blocks: [...shifted, { id, kind: "dialogue-line", order: insertOrder, data, timeline }] };
    }
    case "update-dialogue-line": {
      const line = requireLine(state, command.lineId); const patch = { ...command.patch };
      const invalidates = (patch.text !== undefined && patch.text !== line.data.text) || (patch.characterId !== undefined && patch.characterId !== line.data.characterId)
        || (patch.speechSpeed !== undefined && patch.speechSpeed !== line.data.speechSpeed) || (patch.narratorVoiceId !== undefined && patch.narratorVoiceId !== line.data.narratorVoiceId);
      if (invalidates && patch.speechClipId === undefined) patch.speechClipId = undefined;
      const data = { ...line.data, ...patch } as DialogueLineData;
      if (invalidates && !("speechClipId" in command.patch)) { delete data.speechClipId; delete data.captionWordsOverride; }
      if (patch.characterId !== undefined && patch.characterId !== line.data.characterId && command.patch.performanceCues === undefined) delete data.performanceCues;
      validateLine(state, data);
      return { ...state, blocks: state.blocks.map((block) => block.id === line.id ? { ...block, data } : block) };
    }
    case "set-dialogue-caption-words": {
      const line = requireLine(state, command.lineId); if (!line.data.speechClipId) throw new Error("Generate speech before correcting its captions.");
      const data = { ...line.data }; if (command.words === null) delete data.captionWordsOverride; else data.captionWordsOverride = validateCaptionWords(command.words, speechRepository.get(line.data.speechClipId)?.durationSeconds ?? 0);
      return { ...state, blocks: state.blocks.map((block) => block.id === line.id ? { ...block, data } : block) };
    }
    case "set-dialogue-performance-cues": {
      const line = requireLine(state, command.lineId); const cues = validatePerformanceCues(state, line.data.characterId, command.cues); const data: DialogueLineData = { ...line.data, performanceCues: cues };
      if (!cues.length) delete data.performanceCues;
      return { ...state, blocks: state.blocks.map((block) => block.id === line.id ? { ...block, data } : block) };
    }
    case "duplicate-dialogue-line": {
      const line = requireLine(state, command.lineId); const data = structuredClone(line.data); delete data.speechClipId; delete data.captionWordsOverride;
      return applyCommand(state, { kind: "add-dialogue-line", line: data, afterLineId: line.id });
    }
    case "remove-dialogue-line": {
      requireLine(state, command.lineId); return reorder({ ...state, blocks: state.blocks.filter((block) => block.id !== command.lineId) });
    }
    case "reorder-dialogue-lines": {
      const lines = dialogueBlocks(state); const existing = new Set(lines.map((line) => line.id));
      if (command.lineIds.length !== lines.length || new Set(command.lineIds).size !== lines.length || command.lineIds.some((id) => !existing.has(id)))
        throw new Error("Provide every dialogue line ID exactly once.");
      const order = new Map(command.lineIds.map((id, index) => [id, index]));
      const reordered = { ...state, blocks: state.blocks.map((block) => order.has(block.id) ? { ...block, order: order.get(block.id)! } : block) };
      return state.timeline.mode === "manual" ? reflowManualDialogueLines(reordered, command.lineIds) : reordered;
    }
    case "set-dialogue-gap": return applyCommand(state, { kind: "update-dialogue-line", lineId: command.lineId, patch: { gapAfterSeconds: nonNegative(command.gapAfterSeconds, "Dialogue gap", 10) } });
    case "set-timeline-mode": {
      if (command.mode === state.timeline.mode) return state;
      if (command.mode === "flow") return { ...state, timeline: { ...state.timeline, mode: "flow" } };
      const compiled = compileDialogueTimeline({ ...state, timeline: { ...state.timeline, mode: "flow" } }, speechRepository.list());
      const windows = new Map(compiled.segments.map((segment) => [segment.blockId, segment]));
      return { ...state, timeline: { ...state.timeline, mode: "manual" }, blocks: state.blocks.map((block) => {
        const segment = windows.get(block.id); if (!segment) return block;
        return { ...block, timeline: { ...block.timeline, startSeconds: segment.roles.speech.startSeconds, durationSeconds: segment.roles.speech.durationSeconds, sourceStartSeconds: 0,
          linkGroupId: block.id, locked: false, roleOverrides: undefined } };
      }) };
    }
    case "set-dialogue-timings": {
      if (state.timeline.mode !== "manual") throw new Error("Switch the project timeline to Manual before editing absolute timing.");
      if (!command.edits.length || command.edits.length > 100) throw new Error("Apply between 1 and 100 dialogue timing edits at once.");
      const edits = new Map(command.edits.map((edit) => {
        const line = requireLine(state, edit.lineId); const speech = line.data.speechClipId ? speechRepository.get(line.data.speechClipId) : undefined;
        const sourceDuration = speech?.durationSeconds ?? Math.max(0.8, (line.data.text.match(/\S+/g)?.length ?? 1) / 2.5);
        const current = line.timeline ?? { startSeconds: 0, durationSeconds: sourceDuration, sourceStartSeconds: 0, linkGroupId: line.id, locked: false };
        const startSeconds = nonNegative(edit.startSeconds, "Dialogue start");
        const sourceStartSeconds = edit.sourceStartSeconds === undefined ? current.sourceStartSeconds : nonNegative(edit.sourceStartSeconds, "Dialogue media offset");
        const durationSeconds = edit.durationSeconds === undefined ? current.durationSeconds : nonNegative(edit.durationSeconds, "Dialogue duration");
        const minDuration = 1 / state.canvas.fps;
        if (durationSeconds < minDuration) throw new Error(`Dialogue duration must be at least one frame (${minDuration.toFixed(3)}s).`);
        if (sourceStartSeconds + durationSeconds > sourceDuration + 1e-6) throw new Error("Dialogue trim extends beyond the linked speech clip.");
        return [edit.lineId, { ...current, startSeconds, durationSeconds, sourceStartSeconds, linkGroupId: line.id }] as const;
      }));
      if (edits.size !== command.edits.length) throw new Error("Provide each dialogue line timing only once.");
      return { ...state, blocks: state.blocks.map((block) => edits.has(block.id) ? { ...block, timeline: edits.get(block.id)! } : block) };
    }
    case "set-dialogue-role-linked": {
      if (!command.linked) throw new Error("Dialogue Clips are compound clips. Character, speech, and captions cannot be detached independently.");
      if (state.timeline.mode !== "manual") return state;
      const line = requireLine(state, command.lineId); const current = line.timeline; if (!current) throw new Error("The dialogue line has no authored timing.");
      const overrides = { ...current.roleOverrides };
      delete overrides[command.role];
      return { ...state, blocks: state.blocks.map((block) => block.id === line.id ? { ...block, timeline: { ...current, roleOverrides: Object.keys(overrides).length ? overrides : undefined } } : block) };
    }
    case "set-dialogue-role-timings": {
      throw new Error("Dialogue Clips are compound clips. Edit the dialogue group timing instead of an individual child role.");
    }
    case "set-block-transform": {
      const line = requireLine(state, command.blockId); const fallback = line.timeline?.transform ?? defaultDialogueCharacterTransform(line.data.position); const transform = validateTransform(normalizeTransform(command.transform, fallback));
      const timeline = line.timeline ?? freezeLineWindow(state, line.id); return { ...state, blocks: state.blocks.map((block) => block.id === line.id ? { ...block, timeline: { ...timeline, transform } } : block) };
    }
    case "set-block-motion": {
      const line = requireLine(state, command.blockId); const timeline = line.timeline ?? freezeLineWindow(state, line.id);
      const motion = validateMotion(normalizeProjectMotion(command.motion, line.timeline?.motion ?? DEFAULT_PROJECT_MOTION));
      return { ...state, blocks: state.blocks.map((block) => block.id === line.id ? { ...block, timeline: { ...timeline, motion } } : block) };
    }
    case "set-caption-animation": return { ...state, captionAnimation: validateCaptionAnimation(normalizeCaptionAnimation({ ...state.captionAnimation, ...command.patch })) };
    case "add-project-track": {
      const name = command.name.trim().slice(0, 60); if (!name) throw new Error("Enter a track name."); if (!["visual", "audio", "captions"].includes(command.trackKind)) throw new Error("Track kind is invalid.");
      const track = { id: crypto.randomUUID(), name, kind: command.trackKind, order: state.timeline.tracks.length, locked: false, hidden: false, system: false } as const;
      return { ...state, timeline: { ...state.timeline, tracks: [...state.timeline.tracks, track] } };
    }
    case "update-project-track": {
      const track = requireTrack(state, command.trackId); const name = command.patch.name === undefined ? track.name : command.patch.name.trim().slice(0, 60); if (!name) throw new Error("Enter a track name.");
      return { ...state, timeline: { ...state.timeline, tracks: state.timeline.tracks.map((item) => item.id === track.id ? { ...item, ...command.patch, name } : item) } };
    }
    case "remove-project-track": {
      const track = requireTrack(state, command.trackId); if (track.system) throw new Error("Built-in dialogue tracks cannot be removed.");
      if (state.timeline.items.some((item) => item.trackId === track.id) || state.blocks.some((block) => Object.values(block.timeline?.roleOverrides ?? {}).some((role) => role?.trackId === track.id))) throw new Error("Move every clip off this track before removing it.");
      return { ...state, timeline: { ...state.timeline, tracks: state.timeline.tracks.filter((item) => item.id !== track.id).map((item, order) => ({ ...item, order })) } };
    }
    case "reorder-project-tracks": {
      const current = new Set(state.timeline.tracks.map((track) => track.id)); if (command.trackIds.length !== current.size || new Set(command.trackIds).size !== current.size || command.trackIds.some((id) => !current.has(id))) throw new Error("Provide every project track exactly once.");
      const order = new Map(command.trackIds.map((id, index) => [id, index])); return { ...state, timeline: { ...state.timeline, tracks: state.timeline.tracks.map((track) => ({ ...track, order: order.get(track.id)! })) } };
    }
    case "add-timeline-item": {
      const item = createTimelineItem(state, command.item);
      if (item.kind !== "audio") return { ...state, timeline: { ...state.timeline, items: [...state.timeline.items, item] } };
      const placed = placeAudioItemInLane(state, item, state.timeline.items);
      return { ...placed.state, timeline: { ...placed.state.timeline, items: [...placed.state.timeline.items, placed.item] } };
    }
    case "update-timeline-items": {
      if (!command.edits.length || command.edits.length > 100) throw new Error("Apply between 1 and 100 timeline item edits."); const ids = new Set<string>();
      const patches = new Map(command.edits.map((edit) => { if (ids.has(edit.itemId)) throw new Error("Provide each timeline item only once."); ids.add(edit.itemId); return [edit.itemId, edit.patch] as const; }));
      for (const id of ids) if (!state.timeline.items.some((item) => item.id === id)) throw new Error("Timeline item not found.");
      const updated = state.timeline.items.map((item) => patches.has(item.id) ? validateTimelineItem(state, { ...item, ...patches.get(item.id), transform: normalizeTransform(patches.get(item.id)?.transform, item.transform), motion: normalizeProjectMotion(patches.get(item.id)?.motion, item.motion), transition: normalizeSceneTransition(patches.get(item.id)?.transition, item.transition) }) : item);
      const reflowIds = new Set(command.edits.filter((edit) => {
        const item = updated.find((entry) => entry.id === edit.itemId);
        return item?.kind === "audio" && (edit.patch.startSeconds !== undefined || edit.patch.durationSeconds !== undefined || edit.patch.trackId !== undefined);
      }).map((edit) => edit.itemId));
      let nextState = { ...state, timeline: { ...state.timeline, mode: "manual" as const, items: updated.filter((item) => !reflowIds.has(item.id)) } };
      const placedById = new Map<string, ProjectAuthoredTimelineItem>();
      for (const item of updated) {
        if (!reflowIds.has(item.id)) continue;
        const placed = placeAudioItemInLane(nextState, item, nextState.timeline.items);
        nextState = { ...placed.state, timeline: { ...placed.state.timeline, mode: "manual", items: [...placed.state.timeline.items, placed.item] } };
        placedById.set(item.id, placed.item);
      }
      return { ...nextState, timeline: { ...nextState.timeline, items: updated.map((item) => placedById.get(item.id) ?? item) } };
    }
    case "split-timeline-item": {
      const item = state.timeline.items.find((entry) => entry.id === command.itemId); if (!item) throw new Error("Timeline item not found.");
      const at = nonNegative(command.atSeconds, "Split time"); const minimum = 1 / state.canvas.fps; const leftDuration = at - item.startSeconds; const rightDuration = item.startSeconds + item.durationSeconds - at;
      if (leftDuration < minimum || rightDuration < minimum) throw new Error("Split at least one frame inside the clip.");
      const asset = item.assetId ? mediaRepository.get(item.assetId) : undefined; let rightSourceStart = item.sourceStartSeconds;
      if (["audio", "video"].includes(item.kind)) { rightSourceStart += leftDuration * item.playbackRate; if (item.loop && asset?.durationSeconds) rightSourceStart %= asset.durationSeconds; }
      const left = validateTimelineItem(state, { ...item, id: crypto.randomUUID(), durationSeconds: leftDuration, motion: { ...item.motion, exit: DEFAULT_PROJECT_MOTION.exit } });
      const right = validateTimelineItem(state, { ...item, id: crypto.randomUUID(), startSeconds: at, durationSeconds: rightDuration, sourceStartSeconds: rightSourceStart, motion: { ...item.motion, entrance: DEFAULT_PROJECT_MOTION.entrance }, transition: DEFAULT_SCENE_TRANSITION });
      return { ...state, timeline: { ...state.timeline, mode: "manual", items: state.timeline.items.flatMap((entry) => entry.id === item.id ? [left, right] : [entry]) } };
    }
    case "remove-timeline-items": {
      const ids = new Set(command.itemIds); if (!ids.size || ids.size !== command.itemIds.length) throw new Error("Provide one or more unique timeline item IDs."); if ([...ids].some((id) => !state.timeline.items.some((item) => item.id === id))) throw new Error("Timeline item not found.");
      return { ...state, timeline: { ...state.timeline, items: state.timeline.items.filter((item) => !ids.has(item.id)) } };
    }
    case "set-caption-style": {
      const merged = validateCaptionStyle(normalizeCaptionStyle({ ...state.captions, ...command.patch, presetId: command.patch.presetId ?? "custom" }));
      return { ...state, captions: merged };
    }
    case "replace-editor-state": return command.editorState;
  }
}

function validateLine(state: ProjectEditorState, data: DialogueLineData) {
  if (state.projectType === "dialogue") {
  const character = characterRepository.get(data.characterId);
  if (!character || !state.assets.characterIds.includes(character.id)) throw new Error("Choose a character from this project’s cast.");
  if (!character.images.some((image) => image.id === data.characterImageId)) throw new Error("Choose a valid pose for this character.");
  }
  if (data.text.length > (state.projectType === "reddit-story" ? 20_000 : 5_000)) throw new Error(state.projectType === "reddit-story" ? "A Reddit story cannot exceed 20,000 characters." : "A dialogue line cannot exceed 5,000 characters.");
  if (!["left", "center", "right"].includes(data.position) || !["slow", "normal", "fast"].includes(data.speechSpeed)) throw new Error("Dialogue position or speech speed is invalid.");
  nonNegative(data.gapAfterSeconds, "Dialogue gap", 10);
  if (data.speechClipId && !speechRepository.get(data.speechClipId)) throw new Error("Linked speech clip not found.");
  if (data.captionWordsOverride) validateCaptionWords(data.captionWordsOverride, data.speechClipId ? speechRepository.get(data.speechClipId)?.durationSeconds ?? 0 : 0);
  if (data.performanceCues) validatePerformanceCues(state, data.characterId, data.performanceCues);
}

function validatePerformanceCues(state: ProjectEditorState, characterId: string, cues: import("@/shared/contracts").DialoguePerformanceCue[]) {
  if (cues.length > 200) throw new Error("A Dialogue Clip can contain at most 200 performance cues.");
  const character = characterRepository.get(characterId); if (!character || !state.assets.characterIds.includes(character.id)) throw new Error("Choose a valid dialogue character before adding performance cues.");
  const ids = new Set<string>();
  return cues.map((cue) => {
    if (!cue.id || ids.has(cue.id) || !character.images.some((image) => image.id === cue.characterImageId)) throw new Error("Every performance cue needs a unique ID and a pose from the line's character.");
    ids.add(cue.id); const at = cue.at;
    if (!Number.isInteger(at.wordIndex) || at.wordIndex < 0 || !at.exact.trim() || at.exact.length > 200 || !Number.isInteger(at.occurrence) || at.occurrence < 1 || at.occurrence > 10_000 || at.prefix.length > 300 || at.suffix.length > 300)
      throw new Error("Performance cues must anchor to a valid spoken word.");
    return { ...cue, at: { ...at, exact: at.exact.slice(0, 200), prefix: at.prefix.slice(0, 300), suffix: at.suffix.slice(0, 300) } };
  });
}

function validateFakeTextMessage(data: { side: unknown; text: unknown; sender: unknown }) {
  if (data.side !== "incoming" && data.side !== "outgoing") throw new Error("Choose incoming or outgoing for the Fake Text message.");
  if (typeof data.text !== "string" || data.text.length > 5_000) throw new Error("A Fake Text message cannot exceed 5,000 characters.");
  if (typeof data.sender !== "string" || data.sender.length > 80) throw new Error("A Fake Text sender cannot exceed 80 characters.");
  return { side: data.side, text: data.text, sender: data.sender };
}

function validateFakeTextSettings(settings: NonNullable<ProjectEditorState["fakeText"]>) {
  const colors = [settings.incomingBubbleColor, settings.incomingTextColor, settings.outgoingBubbleColor, settings.outgoingTextColor, settings.backgroundTopColor, settings.backgroundBottomColor];
  if (!colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))) throw new Error("Fake Text colors must use #RRGGBB format.");
  if (settings.staggerSeconds < .1 || settings.staggerSeconds > 3 || settings.holdSeconds < .2 || settings.holdSeconds > 10) throw new Error("Fake Text timing is outside the supported range.");
  if (settings.senderName.length > 80 || settings.contactName.length > 80 || !["light", "dark"].includes(settings.phoneTheme) || !Number.isInteger(settings.unreadCount) || settings.unreadCount < 0 || settings.unreadCount > 999) throw new Error("Fake Text participant or header details are invalid.");
  if (settings.phoneScalePercent < 65 || settings.phoneScalePercent > 96 || settings.gameplayDimPercent < 0 || settings.gameplayDimPercent > 70) throw new Error("Fake Text phone or gameplay layout is outside the supported range.");
}

function validateAndCompile(state: ProjectEditorState): ProjectEditorState {
  const validated = validateProjectState(state.projectType === "fake-text" ? reorderFakeText(state) : reorder(state)); const background = validated.assets.backgroundId ? backgroundRepository.get(validated.assets.backgroundId) : undefined;
  const timeline = validated.projectType === "fake-text" ? compileFakeTextTimeline(validated) : compileDialogueTimeline(validated, speechRepository.list(), background?.durationSeconds);
  return { ...validated, tracks: timeline.tracks };
}

function commitState(projectId: string, currentRevision: number, state: ProjectEditorState, source: "ui" | "mcp" | "system", commandKind: string, summary: string) {
  const database = db(); const now = new Date().toISOString(); const nextRevision = currentRevision + 1; const serialized = JSON.stringify(state);
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare("SELECT revision, history_cursor FROM projects WHERE id = ?").get(projectId) as unknown as { revision: number; history_cursor: number };
    if (row.revision !== currentRevision) throw new ProjectRevisionConflict(row.revision);
    database.prepare("DELETE FROM project_history WHERE project_id = ? AND sequence > ?").run(projectId, row.history_cursor);
    const nextSequence = row.history_cursor + 1;
    database.prepare(`INSERT INTO project_history(project_id, sequence, revision, source, command_kind, summary, editor_state_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(projectId, nextSequence, nextRevision, source, commandKind, summary, serialized, now);
    database.prepare("UPDATE projects SET editor_state_json = ?, revision = ?, history_cursor = ?, updated_at = ? WHERE id = ?")
      .run(serialized, nextRevision, nextSequence, now, projectId);
    const old = database.prepare("SELECT sequence FROM project_history WHERE project_id = ? ORDER BY sequence DESC LIMIT -1 OFFSET 100").all(projectId) as unknown as Array<{ sequence: number }>;
    for (const entry of old) database.prepare("DELETE FROM project_history WHERE project_id = ? AND sequence = ?").run(projectId, entry.sequence);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

function moveHistory(projectId: string, direction: -1 | 1, expectedRevision?: number): ProjectCommandResult {
  const current = requireProject(projectId); assertRevision(current.revision, expectedRevision); const database = db(); const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare("SELECT revision, history_cursor FROM projects WHERE id = ?").get(projectId) as unknown as { revision: number; history_cursor: number };
    if (row.revision !== current.revision) throw new ProjectRevisionConflict(row.revision);
    const operator = direction < 0 ? "<" : ">"; const order = direction < 0 ? "DESC" : "ASC";
    const target = database.prepare(`SELECT sequence, editor_state_json FROM project_history WHERE project_id = ? AND sequence ${operator} ? ORDER BY sequence ${order} LIMIT 1`)
      .get(projectId, row.history_cursor) as unknown as { sequence: number; editor_state_json: string } | undefined;
    if (!target) throw new Error(direction < 0 ? "Nothing to undo." : "Nothing to redo.");
    database.prepare("UPDATE projects SET editor_state_json = ?, revision = ?, history_cursor = ?, updated_at = ? WHERE id = ?")
      .run(target.editor_state_json, row.revision + 1, target.sequence, now, projectId);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return resultFor(requireProject(projectId));
}

function resultFor(project: ReturnType<typeof requireProject>): ProjectCommandResult {
  const background = project.editorState.assets.backgroundId ? backgroundRepository.get(project.editorState.assets.backgroundId) : undefined;
  const timeline = project.editorState.projectType === "fake-text" ? compileFakeTextTimeline(project.editorState) : compileDialogueTimeline(project.editorState, speechRepository.list(), background?.durationSeconds);
  return { project, revision: project.revision, timeline, canUndo: project.canUndo, canRedo: project.canRedo, validationIssues: validationIssues(project.editorState) };
}

function validationIssues(state: ProjectEditorState): ProjectValidationIssue[] {
  const issues: ProjectValidationIssue[] = [];
  if (state.projectType === "fake-text") {
    const messages = fakeTextBlocks(state); if (!messages.length) issues.push({ code: "NO_MESSAGES", message: "Add at least one Fake Text message.", severity: "error" });
    for (const message of messages) if (!message.data.text.trim()) issues.push({ code: "EMPTY_MESSAGE", message: "A Fake Text message is empty.", severity: "error", lineId: message.id });
    return issues;
  }
  const lines = dialogueBlocks(state);
  if (!lines.length) issues.push({ code: state.projectType === "reddit-story" ? "NO_STORY" : "NO_DIALOGUE", message: state.projectType === "reddit-story" ? "Add a Reddit story." : "Add at least one dialogue line.", severity: "error" });
  if (!state.assets.backgroundId) issues.push({ code: "NO_BACKGROUND", message: "No background is selected.", severity: "warning" });
  else if (!backgroundRepository.get(state.assets.backgroundId)) issues.push({ code: "MISSING_BACKGROUND", message: "The selected background is no longer available. Choose a replacement.", severity: "error" });
  for (const line of lines) {
    if (!line.data.text.trim()) issues.push({ code: "EMPTY_DIALOGUE", message: "Dialogue text is empty.", severity: "error", lineId: line.id });
    if (state.projectType === "dialogue") {
      const character = characterRepository.get(line.data.characterId);
      if (!character) issues.push({ code: "MISSING_CHARACTER", message: "The assigned character is no longer available. Choose a replacement.", severity: "error", lineId: line.id });
      else if (!character.images.some((image) => image.id === line.data.characterImageId)) issues.push({ code: "MISSING_POSE", message: "The assigned character pose is no longer available. Choose a replacement.", severity: "error", lineId: line.id });
      else if ((line.data.performanceCues ?? []).some((cue) => !character.images.some((image) => image.id === cue.characterImageId))) issues.push({ code: "MISSING_PERFORMANCE_POSE", message: "A Dialogue Clip performance cue references a missing pose.", severity: "error", lineId: line.id });
    } else if (!line.data.narratorVoiceId) issues.push({ code: "NARRATOR_REQUIRED", message: "Choose a narrator voice.", severity: "error", lineId: line.id });
    if (!line.data.speechClipId || !speechRepository.get(line.data.speechClipId)) issues.push({ code: "AUDIO_REQUIRED", message: "Generate speech for this line.", severity: "error", lineId: line.id });
    else { const speech = speechRepository.get(line.data.speechClipId); if ((line.data.performanceCues?.length ?? 0) > resolveDialoguePerformanceCues(line.data, speech).length) issues.push({ code: "UNRESOLVED_PERFORMANCE_CUE", message: "A Dialogue Clip pose cue no longer matches a spoken word.", severity: "warning", lineId: line.id }); }
  }
  const timelineSignatures = new Set<string>();
  for (const item of state.timeline.items) {
    const signature = [item.kind, item.trackId, item.assetId ?? "", item.text ?? "", item.startSeconds.toFixed(6), item.sourceStartSeconds.toFixed(6), item.durationSeconds.toFixed(6)].join(":");
    if (timelineSignatures.has(signature)) issues.push({ code: "DUPLICATE_TIMELINE_ITEM", message: "Identical media clips overlap at the same timeline position.", severity: "warning" });
    timelineSignatures.add(signature);
    if (item.kind === "character-pose") {
      const character = item.characterId ? characterRepository.get(item.characterId) : undefined;
      if (!character || !character.images.some((image) => image.id === item.characterImageId)) issues.push({ code: "MISSING_TIMELINE_POSE", message: "A timeline character pose is no longer available. Replace or remove the item.", severity: "error" });
    } else if (item.kind !== "text" && (!item.assetId || !mediaRepository.get(item.assetId))) {
      issues.push({ code: "MISSING_TIMELINE_ASSET", message: "A timeline media asset is no longer available. Replace or remove the item.", severity: "error" });
    }
  }
  const audioItems = state.timeline.items.filter((item) => item.kind === "audio");
  for (let index = 0; index < audioItems.length; index++) {
    if (audioItems.slice(index + 1).some((item) => item.trackId === audioItems[index].trackId && timelineWindowsOverlap(item, audioItems[index]))) {
      issues.push({ code: "OVERLAPPING_AUDIO_ITEMS", message: "Audio clips overlap on the same track. Move one clip or let Dialogue Lab place it on another audio track.", severity: "warning" });
      break;
    }
  }
  return issues;
}

function requireProject(id: string) { const project = projectRepository.get(id); if (!project) throw new Error("Project not found."); return project; }
function requireLine(state: ProjectEditorState, id: string) { const line = dialogueBlocks(state).find((item) => item.id === id); if (!line) throw new Error("Dialogue line not found."); return line; }
function requireFakeTextProject(state: ProjectEditorState) { if (state.projectType !== "fake-text") throw new Error("This edit requires a Fake Text project."); }
function requireFakeTextMessage(state: ProjectEditorState, id: string) { const message = fakeTextBlocks(state).find((item) => item.id === id); if (!message) throw new Error("Fake Text message not found."); return message; }
function assertRevision(current: number, expected?: number) { if (expected !== undefined && expected !== current) throw new ProjectRevisionConflict(current); }
function nonNegative(value: number, label: string, max = 86_400) { if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`${label} must be between 0 and ${max}.`); return value; }
function positive(value: number, label: string, max = 86_400) { if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${label} must be greater than 0 and no more than ${max}.`); return value; }
function reorder(state: ProjectEditorState) { const order = new Map(dialogueBlocks(state).map((line, index) => [line.id, index])); return { ...state, blocks: state.blocks.map((block) => order.has(block.id) ? { ...block, order: order.get(block.id)! } : block) }; }
function reorderFakeText(state: ProjectEditorState) { const order = new Map(fakeTextBlocks(state).map((message, index) => [message.id, index])); return { ...state, blocks: state.blocks.map((block) => order.has(block.id) ? { ...block, order: order.get(block.id)! } : block) }; }
function reflowManualDialogueLines(state: ProjectEditorState, lineIds: string[]): ProjectEditorState {
  const lines = new Map(dialogueBlocks(state).map((line) => [line.id, line]));
  const authoredStarts = [...lines.values()].map((line) => line.timeline?.startSeconds).filter((value): value is number => Number.isFinite(value));
  let cursor = authoredStarts.length ? Math.max(0, Math.min(...authoredStarts)) : 0;
  const windows = new Map<string, NonNullable<ReturnType<typeof requireLine>["timeline"]>>();
  for (const lineId of lineIds) {
    const line = lines.get(lineId); if (!line) continue;
    const speech = line.data.speechClipId ? speechRepository.get(line.data.speechClipId) : undefined;
    const sourceDuration = speech?.durationSeconds ?? Math.max(.8, (line.data.text.match(/\S+/g)?.length ?? 1) / 2.5);
    const minimum = 1 / state.canvas.fps; const current = line.timeline;
    const sourceStartSeconds = Math.min(Math.max(0, current?.sourceStartSeconds ?? 0), Math.max(0, sourceDuration - minimum));
    const availableDuration = Math.max(minimum, sourceDuration - sourceStartSeconds);
    const durationSeconds = Math.min(Math.max(minimum, current?.durationSeconds ?? sourceDuration), availableDuration);
    windows.set(lineId, { ...(current ?? {}), startSeconds: cursor, durationSeconds, sourceStartSeconds, linkGroupId: lineId, locked: current?.locked ?? false, roleOverrides: undefined });
    cursor += durationSeconds + Math.max(0, line.data.gapAfterSeconds);
  }
  return { ...state, blocks: state.blocks.map((block) => windows.has(block.id) ? { ...block, timeline: windows.get(block.id)! } : block) };
}
function summarize(commands: ProjectCommand[]) { if (commands.length > 1) return `Applied ${commands.length} project edits`; return commands[0].kind.replaceAll("-", " "); }

function requireTrack(state: ProjectEditorState, id: string) { const track = state.timeline.tracks.find((item) => item.id === id); if (!track) throw new Error("Project track not found."); return track; }
function timelineWindowsOverlap(left: ProjectTimelineWindow, right: ProjectTimelineWindow) {
  return left.startSeconds < right.startSeconds + right.durationSeconds - 1e-6
    && right.startSeconds < left.startSeconds + left.durationSeconds - 1e-6;
}
function placeAudioItemInLane(state: ProjectEditorState, item: ProjectAuthoredTimelineItem, occupiedItems: ProjectAuthoredTimelineItem[]) {
  if (item.kind !== "audio") return { state, item };
  const audioTracks = state.timeline.tracks.filter((track) => track.kind === "audio" && track.id !== "speech").sort((left, right) => left.order - right.order);
  const requested = audioTracks.find((track) => track.id === item.trackId);
  const candidates = requested ? [requested, ...audioTracks.filter((track) => track.id !== requested.id)] : audioTracks;
  const available = candidates.find((track) => !occupiedItems.some((existing) => existing.kind === "audio" && existing.trackId === track.id && existing.id !== item.id && timelineWindowsOverlap(existing, item)));
  if (available) return { state, item: { ...item, trackId: available.id } };
  const track: ProjectAuthoredTrack = {
    id: crypto.randomUUID(), name: nextAudioTrackName(state.timeline.tracks), kind: "audio",
    order: state.timeline.tracks.length, locked: false, hidden: false, system: false,
  };
  const nextState = { ...state, timeline: { ...state.timeline, tracks: [...state.timeline.tracks, track] } };
  return { state: nextState, item: { ...item, trackId: track.id } };
}
function nextAudioTrackName(tracks: ProjectAuthoredTrack[]) {
  const names = new Set(tracks.map((track) => track.name.trim().toLowerCase()));
  for (let suffix = 2; suffix < 10_000; suffix++) if (!names.has(`audio ${suffix}`)) return `Audio ${suffix}`;
  return `Audio ${tracks.length + 1}`;
}
function freezeLineWindow(state: ProjectEditorState, lineId: string) {
  const segment = compileDialogueTimeline(state, speechRepository.list()).segments.find((item) => item.blockId === lineId); if (!segment) throw new Error("Dialogue line not found.");
  return { startSeconds: segment.roles.speech.startSeconds, durationSeconds: segment.roles.speech.durationSeconds, sourceStartSeconds: segment.roles.speech.sourceStartSeconds,
    linkGroupId: lineId, locked: false };
}
function validateTransform(value: ProjectElementTransform) {
  if (value.xPercent < -100 || value.xPercent > 200 || value.yPercent < -100 || value.yPercent > 200 || value.widthPercent < 1 || value.widthPercent > 300
    || value.heightPercent < 1 || value.heightPercent > 300 || value.rotationDegrees < -360 || value.rotationDegrees > 360 || value.opacity < 0 || value.opacity > 1
    || !Number.isInteger(value.zIndex) || value.zIndex < -1000 || value.zIndex > 1000) throw new Error("Element transform is outside the supported canvas range.");
  return value;
}
function validateRoleWindow(state: ProjectEditorState, lineId: string, role: "character" | "speech" | "captions", window: ProjectTimelineWindow) {
  const line = requireLine(state, lineId); const speech = line.data.speechClipId ? speechRepository.get(line.data.speechClipId) : undefined;
  const track = requireTrack(state, window.trackId); if (role === "speech" && track.kind !== "audio") throw new Error("Speech belongs on an audio track."); if (role === "character" && track.kind !== "visual") throw new Error("Characters belong on a visual track."); if (role === "captions" && track.kind === "audio") throw new Error("Captions belong on a visual or captions track.");
  const sourceDuration = speech?.durationSeconds ?? Math.max(.8, (line.data.text.match(/\S+/g)?.length ?? 1) / 2.5); const minimum = 1 / state.canvas.fps;
  if (window.durationSeconds < minimum) throw new Error(`Timeline duration must be at least one frame (${minimum.toFixed(3)}s).`);
  if (role !== "character" && window.sourceStartSeconds + window.durationSeconds > sourceDuration + 1e-6) throw new Error("The trim extends beyond the linked speech clip.");
}
function createTimelineItem(state: ProjectEditorState, input: Extract<ProjectCommand, { kind: "add-timeline-item" }>["item"]): ProjectAuthoredTimelineItem {
  const track = requireTrack(state, input.trackId); const asset = input.assetId ? mediaRepository.get(input.assetId) : undefined;
  if (input.kind === "text") { if (!input.text?.trim()) throw new Error("Enter text for the timeline item."); if (track.kind === "audio") throw new Error("Text belongs on a visual or captions track."); }
  else if (input.kind === "character-pose") { const character = input.characterId ? characterRepository.get(input.characterId) : undefined; if (!character || !state.assets.characterIds.includes(character.id) || !character.images.some((image) => image.id === input.characterImageId)) throw new Error("Choose a valid pose from the project cast."); if (track.kind !== "visual") throw new Error("Character poses belong on a visual track."); }
  else { if (!asset || asset.kind !== input.kind) throw new Error("Choose a matching local media asset."); if (input.kind === "audio" && track.kind !== "audio") throw new Error("Audio belongs on an audio track."); if (input.kind !== "audio" && track.kind === "audio") throw new Error("Visual media belongs on a visual track."); }
  const sourceDuration = asset?.durationSeconds || (["image", "text", "character-pose"].includes(input.kind) ? 3 : 1); const sourceStartSeconds = input.sourceStartSeconds ?? 0;
  const durationSeconds = input.durationSeconds ?? (["image", "text", "character-pose"].includes(input.kind) ? 3 : Math.max(1 / state.canvas.fps, sourceDuration - sourceStartSeconds));
  const fallbackTransform = input.kind === "text" ? { ...DEFAULT_PROJECT_TRANSFORM, widthPercent: 70, heightPercent: 20, zIndex: 10 } : input.kind === "character-pose" ? defaultDialogueCharacterTransform("center") : DEFAULT_PROJECT_TRANSFORM;
  return validateTimelineItem(state, { id: crypto.randomUUID(), kind: input.kind, trackId: input.trackId, assetId: input.assetId, characterId: input.characterId, characterImageId: input.characterImageId, text: input.text?.trim().slice(0, 5000),
    startSeconds: input.startSeconds ?? 0, durationSeconds, sourceStartSeconds, transform: normalizeTransform(input.transform, fallbackTransform), motion: normalizeProjectMotion(input.motion), transition: normalizeSceneTransition(input.transition),
    volume: input.volume ?? 1, playbackRate: input.playbackRate ?? 1, muted: input.muted === true, loop: input.loop === true, locked: input.locked === true, hidden: input.hidden === true });
}
function validateTimelineItem(state: ProjectEditorState, item: ProjectAuthoredTimelineItem): ProjectAuthoredTimelineItem {
  const track = requireTrack(state, item.trackId); nonNegative(item.startSeconds, "Timeline start"); positive(item.durationSeconds, "Timeline duration"); nonNegative(item.sourceStartSeconds, "Media offset"); validateTransform(item.transform); validateMotion(item.motion); validateTransition(item.transition);
  if (!Number.isFinite(item.volume) || item.volume < 0 || item.volume > 1 || !Number.isFinite(item.playbackRate) || item.playbackRate < .25 || item.playbackRate > 4) throw new Error("Volume must be 0â€“1 and playback speed must be 0.25â€“4x.");
  if (item.kind === "text") { if (!item.text?.trim() || item.text.length > 5000) throw new Error("Text items require between 1 and 5,000 characters."); }
  else if (item.kind === "character-pose") { const character = item.characterId ? characterRepository.get(item.characterId) : undefined; if (!character || !state.assets.characterIds.includes(character.id) || !character.images.some((image) => image.id === item.characterImageId)) throw new Error("Timeline character pose not found."); }
  else { const asset = item.assetId ? mediaRepository.get(item.assetId) : undefined; if (!asset || asset.kind !== item.kind) throw new Error("Timeline media asset not found.");
    if (asset.durationSeconds && !item.loop && item.sourceStartSeconds + item.durationSeconds * item.playbackRate > asset.durationSeconds + 1e-6) throw new Error("Timeline trim extends beyond the media asset."); }
  if (item.kind === "audio" && track.kind !== "audio") throw new Error("Audio belongs on an audio track."); if (item.kind !== "audio" && track.kind === "audio") throw new Error("Visual items do not belong on an audio track.");
  return item;
}

function validateMotion(value: ProjectAuthoredTimelineItem["motion"]) { for (const config of [value.entrance, value.during, value.exit, value.combo].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) { if (!Number.isFinite(config.durationSeconds) || config.durationSeconds < 0 || config.durationSeconds > 10 || !PROJECT_MOTION_PRESETS.includes(config.preset) || !["smooth", "snappy", "gentle"].includes(config.easing) || !["left", "right", "up", "down"].includes(config.direction)) throw new Error("Choose a supported motion preset, direction, easing, and duration from 0 to 10 seconds."); } return value; }
function validateCaptionWords(words: import("@/shared/contracts").SpeechWord[], durationSeconds: number) {
  if (!words.length || words.length > 5_000) throw new Error("Provide between 1 and 5,000 caption tokens."); let previous = 0;
  return words.map((word) => { if (!["word", "spacing", "punctuation"].includes(word.type) || typeof word.text !== "string" || word.text.length > 200 || !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds) || word.startSeconds < previous || word.endSeconds < word.startSeconds || word.endSeconds > durationSeconds + 1e-3) throw new Error("Caption tokens must have valid ordered timings inside the speech clip."); previous = word.startSeconds; return { ...word, text: word.text.slice(0, 200) }; });
}
function validateTransition(value: ProjectAuthoredTimelineItem["transition"]) { if (!Number.isFinite(value.durationSeconds) || value.durationSeconds < 0 || value.durationSeconds > 10 || !["cut", "fade", "crossfade", "slide", "zoom"].includes(value.preset) || !["left", "right", "up", "down"].includes(value.direction)) throw new Error("Choose a supported visual transition and duration from 0 to 10 seconds."); return value; }
function validateCaptionAnimation(value: ProjectEditorState["captionAnimation"]) { if (!Number.isFinite(value.durationSeconds) || value.durationSeconds < 0 || value.durationSeconds > 3 || !["none", "pop", "word-reveal", "karaoke", "bounce"].includes(value.preset)) throw new Error("Choose a supported caption animation and duration from 0 to 3 seconds."); return value; }
