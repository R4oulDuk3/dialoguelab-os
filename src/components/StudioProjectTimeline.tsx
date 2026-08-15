"use client";

import { Captions, ChevronDown, ChevronUp, Film, Image as ImageIcon, Magnet, Mic2, Type } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Timeline, usePlayerStore, type TimelineElement } from "@hyperframes/studio";
import type { DialogueTimelineRole, ProjectAuthoredTrack, ProjectMediaAssetRecord, ProjectTimelineMode } from "@/shared/contracts";
import type { CompiledDialogueTimeline } from "@/shared/project-timeline";

type ClipRole = "background" | "dialogue" | DialogueTimelineRole | "image" | "video" | "audio" | "text" | "character-pose";
export type TimelineEditTarget = { kind: "dialogue"; lineId: string; role: DialogueTimelineRole; linked: boolean } | { kind: "item"; itemId: string };
export interface TimelineElementEdit { target: TimelineEditTarget; startSeconds: number; durationSeconds?: number; sourceStartSeconds?: number; trackId?: string }

export interface StudioProjectTimelineProps {
  projectId: string; revision: number; fps: number; timeline: CompiledDialogueTimeline; tracks: ProjectAuthoredTrack[]; media: ProjectMediaAssetRecord[]; currentTime: number; mode: ProjectTimelineMode;
  selectedTarget?: TimelineEditTarget; onSelectTarget: (target: TimelineEditTarget) => void; onSeek: (seconds: number) => void; onEditElements: (edits: TimelineElementEdit[]) => Promise<void>;
  onRemoveElements: (targets: TimelineEditTarget[]) => Promise<void>; onSetMode: (mode: ProjectTimelineMode) => Promise<void>;
}

export function StudioProjectTimeline({ projectId, revision, fps, timeline, tracks, media, currentTime, mode, selectedTarget, onSelectTarget, onSeek, onEditElements, onRemoveElements, onSetMode }: StudioProjectTimelineProps) {
  const [expanded, setExpanded] = useState(false); const snapEnabled = usePlayerStore((state) => state.timelineSnapEnabled); const setSnapEnabled = usePlayerStore((state) => state.setTimelineSnapEnabled);
  const sessionEpoch = usePlayerStore((state) => state.timelineSessionEpoch); const elements = useMemo(() => toStudioElements(timeline, tracks, media, mode), [timeline, tracks, media, mode]);
  useEffect(() => { const store = usePlayerStore.getState(); store.beginTimelineSession(projectId); store.setElements(elements); store.setDuration(timeline.durationSeconds); store.setTimelineReady(elements.length > 0); }, [elements, projectId, revision, timeline.durationSeconds]);
  useEffect(() => { usePlayerStore.getState().setCurrentTime(currentTime); }, [currentTime]);
  useEffect(() => { const store = usePlayerStore.getState(); if (!selectedTarget) return; if (selectedTarget.kind === "item") { const element = store.elements.find((entry) => entry.hfId === `item:${selectedTarget.itemId}`); if (element) store.setSelection([elementKey(element)], elementKey(element)); return; }
    const element = store.elements.find((entry) => entry.hfId === `dialogue:${selectedTarget.lineId}:compound`); if (!element) return; store.setSelection([elementKey(element)], elementKey(element));
  }, [elements, selectedTarget]);

  const selectElement = useCallback((element: TimelineElement | null, seek = true) => { if (!element) return; const target = targetForElement(element); if (!target) return;
    const selection = target.kind === "dialogue" && target.linked ? groupElements(usePlayerStore.getState().elements, target.lineId).filter(isLinkedElement) : [element]; usePlayerStore.getState().setSelection(selection.map(elementKey), elementKey(element)); onSelectTarget(target); if (seek) onSeek(element.start);
  }, [onSeek, onSelectTarget]);
  const restore = useCallback(() => { const store = usePlayerStore.getState(); store.setElements(toStudioElements(timeline, tracks, media, mode)); store.setDuration(timeline.durationSeconds); }, [timeline, tracks, media, mode]);
  const commit = useCallback(async (changes: Array<{ element: TimelineElement; start: number; duration?: number; playbackStart?: number; track?: number }>) => {
    const edits = changes.flatMap(({ element, start, duration, playbackStart, track }) => { const target = targetForElement(element); if (!target) return []; return [{ target, startSeconds: start,
      ...(duration === undefined ? {} : { durationSeconds: duration }), ...(playbackStart === undefined ? {} : { sourceStartSeconds: playbackStart }), ...(track === undefined ? {} : { trackId: trackIdAt(tracks, track) }) }]; });
    if (!edits.length) return; try { await onEditElements(dedupeLinkedEdits(edits)); } finally { restore(); }
  }, [onEditElements, restore, tracks]);
  const remove = useCallback(async (elementList: TimelineElement[]) => { const targets = uniqueTargets(elementList.map(targetForElement).filter((value): value is TimelineEditTarget => Boolean(value))); if (targets.length) await onRemoveElements(targets); }, [onRemoveElements]);

  useEffect(() => { const keyboard = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (target?.matches("input,textarea,select,[contenteditable=true]")) return; const store = usePlayerStore.getState(); const selected = store.elements.filter((element) => store.selectedElementIds.has(elementKey(element))); if (!selected.length) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 / fps : 1 / fps); void commit(selected.map((element) => ({ element, start: Math.max(0, element.start + delta), track: element.track }))); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); void remove(selected); }
  }; window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard); }, [commit, fps, remove]);

  return <section className={`studio-project-timeline ${expanded ? "expanded" : "collapsed"} ${mode}`}><header>
    <button className="studio-timeline-toggle" aria-expanded={expanded} aria-controls="project-studio-timeline" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />} {expanded ? "Close Timeline" : "Open Timeline"}</button>
    <span className="studio-mode-toggle" aria-label="Timeline editing mode"><button className={mode === "flow" ? "active" : ""} onClick={() => void onSetMode("flow")}>Flow</button><button className={mode === "manual" ? "active" : ""} onClick={() => void onSetMode("manual")}>Manual</button></span>
    <time>{formatTime(currentTime)} / {formatTime(timeline.durationSeconds)}</time><button className={`studio-snap-toggle ${snapEnabled ? "active" : ""}`} aria-pressed={snapEnabled} onClick={() => setSnapEnabled(!snapEnabled)}><Magnet size={13} /> Snap</button>
  </header>{expanded && <div id="project-studio-timeline" className="studio-timeline-stage" onPointerDownCapture={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey) return; const clip = (event.target as Element | null)?.closest<HTMLElement>("[data-el-id]"); if (!clip?.dataset.elId) return; const element = usePlayerStore.getState().elements.find((item) => elementKey(item) === clip.dataset.elId); if (element) selectElement(element, false); }}>
    <Timeline sessionEpoch={sessionEpoch} onSeek={onSeek} onSelectElement={(element) => selectElement(element)}
      onMoveElement={(element, updates) => commit([{ element, start: updates.start, track: updates.track }])}
      onMoveElements={(edits) => commit(edits.map(({ element, updates }) => ({ element, start: updates.start, track: updates.track })))}
      onResizeElement={mode === "manual" ? (element, updates) => commit([{ element, start: updates.start, duration: updates.duration, playbackStart: updates.playbackStart }]) : undefined}
      onResizeElements={mode === "manual" ? (changes) => commit(changes.map(({ element, start, duration, playbackStart }) => ({ element, start, duration, playbackStart }))) : undefined}
      onDeleteElement={(element) => remove([element])} onBlockedEditAttempt={() => undefined} renderClipContent={(element) => <ClipContent element={element} />} theme={TIMELINE_THEME} />
  </div>}</section>;
}

const TIMELINE_THEME = { shellBackground: "#f4f1f5", shellBorder: "#ded8e3", rulerBorder: "#d8d1dd", rowBackground: "#faf9fb", rowBorder: "#e4dfe7", gutterBackground: "#f7f5f8", gutterBorder: "#ded8e3", textPrimary: "#4d4554", textSecondary: "#817887", tickText: "#817887", tickMajor: "rgba(95,86,102,.18)", tickMinor: "rgba(95,86,102,.08)", clipBackground: "#ece7f0", clipBackgroundActive: "#e4daf0", clipBorder: "rgba(76,67,83,.14)", clipBorderHover: "rgba(109,40,217,.38)", clipBorderActive: "#7c3aed", clipShadow: "none", clipShadowHover: "0 2px 8px rgba(52,39,63,.12)", clipShadowActive: "0 0 0 2px rgba(124,58,237,.16)", clipShadowDragging: "0 8px 22px rgba(52,39,63,.22)", handleColor: "#7c3aed", panelResizeSeam: "#d8d1dd", panelResizeActive: "#8b5cf6", clipRadius: "6px" };
function ClipContent({ element }: { element: TimelineElement }) { const role = elementRole(element); const Icon = role === "background" || role === "video" ? Film : role === "character" || role === "image" || role === "character-pose" ? ImageIcon : role === "dialogue" || role === "speech" || role === "audio" ? Mic2 : role === "text" ? Type : Captions; return <span className={`studio-clip-content studio-clip-${role}`}><Icon size={11} /><span>{element.label}</span>{(role === "dialogue" || role === "speech" || role === "audio") && <i className="studio-speech-bars" />}</span>; }

function toStudioElements(timeline: CompiledDialogueTimeline, tracks: ProjectAuthoredTrack[], media: ProjectMediaAssetRecord[], mode: ProjectTimelineMode): TimelineElement[] {
  const mediaById = new Map(media.map((asset) => [asset.id, asset])); const visibleTracks = timelineItemTracks(tracks); const trackNumbers = new Map(visibleTracks.map((track, index) => [track.id, index + 2])); const elements: TimelineElement[] = [];
  const background = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.kind === "background-video");
  if (background) elements.push({ id: background.id, key: background.id, domId: background.id, hfId: "background:main", selector: "linked", tag: "video", kind: "video", label: "Background", start: background.startSeconds, duration: background.durationSeconds,
    track: 0, authoredTrack: 0, timingSource: "authored", timelineLocked: true, playbackStart: Number(background.metadata?.mediaStartSeconds ?? 0), sourceDuration: Number(background.metadata?.sourceDurationSeconds ?? background.durationSeconds), playbackStartAttr: "media-start" });
  for (const [index, segment] of timeline.segments.entries()) { const id = `dialogue-clip-${segment.blockId}`; elements.push({ id, key: id, domId: id, hfId: `dialogue:${segment.blockId}:compound`, selector: "linked", tag: "div", kind: "element",
    label: `Line ${index + 1} · ${segment.data.text || "Untitled dialogue"}`, start: segment.startSeconds, duration: segment.durationSeconds, track: 1, authoredTrack: 1, timingSource: "authored", timelineLocked: mode === "flow",
    playbackStart: segment.sourceStartSeconds, sourceDuration: segment.sourceDurationSeconds, playbackStartAttr: "media-start" }); }
  for (const track of timeline.tracks) for (const clip of track.clips) { const itemId = typeof clip.metadata?.itemId === "string" ? clip.metadata.itemId : undefined; if (!itemId) continue; const role = roleForClip(clip.kind); const kind: TimelineElement["kind"] = role === "video" ? "video" : role === "image" ? "image" : role === "audio" ? "audio" : "element"; const asset = clip.sourceId ? mediaById.get(clip.sourceId) : undefined; const trackNumber = trackNumbers.get(track.id) ?? 2;
    elements.push({ id: clip.id, key: clip.id, domId: clip.id, hfId: `item:${itemId}`, selector: `item-${role}`, tag: kind === "image" ? "img" : kind === "element" ? "div" : kind, kind,
      label: String(clip.metadata?.text || asset?.name || role), start: clip.startSeconds, duration: clip.durationSeconds, track: trackNumber, authoredTrack: trackNumber, timingSource: "authored", timelineLocked: clip.metadata?.locked === true,
      playbackStart: Number(clip.metadata?.sourceStartSeconds ?? 0), sourceDuration: Number(asset?.durationSeconds ?? clip.durationSeconds), playbackStartAttr: "media-start" }); }
  return elements;
}

function timelineItemTracks(tracks: ProjectAuthoredTrack[]) { return tracks.filter((track) => !["characters", "captions", "speech"].includes(track.id)).slice().sort((a, b) => a.order - b.order); }
function trackIdAt(tracks: ProjectAuthoredTrack[], index: number) { return index < 2 ? undefined : timelineItemTracks(tracks)[index - 2]?.id; }
function targetForElement(element: TimelineElement): TimelineEditTarget | undefined { const item = element.hfId?.match(/^item:(.+)$/); if (item) return { kind: "item", itemId: item[1] }; const dialogue = element.hfId?.match(/^dialogue:(.+):compound$/); return dialogue ? { kind: "dialogue", lineId: dialogue[1], role: "character", linked: true } : undefined; }
function isLinkedElement(element: TimelineElement) { return element.selector !== "unlinked"; }
function dedupeLinkedEdits(edits: TimelineElementEdit[]) { const linked = new Set<string>(); return edits.filter((edit) => edit.target.kind !== "dialogue" || !edit.target.linked || !linked.has(edit.target.lineId) && Boolean(linked.add(edit.target.lineId))); }
function uniqueTargets(targets: TimelineEditTarget[]) { const seen = new Set<string>(); return targets.filter((target) => { const key = target.kind === "item" ? `item:${target.itemId}` : target.linked ? `dialogue:${target.lineId}:linked` : `dialogue:${target.lineId}:${target.role}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function groupElements(elements: TimelineElement[], lineId: string) { return elements.filter((element) => targetForElement(element)?.kind === "dialogue" && (targetForElement(element) as Extract<TimelineEditTarget, { kind: "dialogue" }>).lineId === lineId); }
function elementKey(element: TimelineElement) { return element.key ?? element.id; }
function elementRole(element: TimelineElement): ClipRole { const target = targetForElement(element); if (target?.kind === "dialogue") return "dialogue"; if (element.hfId?.startsWith("item:")) return element.selector?.startsWith("item-") ? element.selector.slice(5) as ClipRole : roleForClip(element.kind === "image" ? "image" : element.kind === "video" ? "video" : element.kind === "audio" ? "audio" : "text"); return "background"; }
function roleForClip(kind: string): ClipRole { return kind === "background-video" ? "background" : kind === "character-image" ? "character" : kind === "speech" ? "speech" : kind === "captions" ? "captions" : kind === "image" || kind === "video" || kind === "audio" || kind === "text" || kind === "character-pose" ? kind : "text"; }
function formatTime(seconds: number) { const safe = Math.max(0, seconds); return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(2).padStart(5, "0")}`; }
