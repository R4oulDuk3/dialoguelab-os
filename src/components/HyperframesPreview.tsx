"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HyperframesPlayer } from "@hyperframes/player";
import { defaultDialogueCharacterTransform, type CompiledDialogueTimeline } from "@/shared/project-timeline";
import type { ProjectElementTransform, ProjectMediaAssetRecord, ProjectRecord } from "@/shared/contracts";
import type { TimelineEditTarget } from "./StudioProjectTimeline";

const UI_UPDATE_INTERVAL_MS = 66;
const MEDIA_WARMUP_TIMEOUT_MS = 3500;

export interface ProjectPlayerAdapter {
  play(): void; pause(): void; seek(seconds: number): void; currentTime(): number; duration(): number;
}

export function HyperframesPreview({ project, timeline, media, currentTime, playing, selectedTarget, onAdapter, onTime, onPlaying, onSelectLine, onSelectTarget, onTransform }:
  { project: ProjectRecord; timeline: CompiledDialogueTimeline; media: ProjectMediaAssetRecord[]; currentTime: number; playing: boolean; selectedTarget?: TimelineEditTarget;
    onAdapter: (adapter?: ProjectPlayerAdapter) => void; onTime: (seconds: number) => void; onPlaying: (playing: boolean) => void; onSelectLine: (lineId: string) => void;
    onSelectTarget: (target: TimelineEditTarget) => void; onTransform: (target: TimelineEditTarget, transform: ProjectElementTransform) => Promise<void> }) {
  const host = useRef<HTMLDivElement>(null); const resumeAt = useRef(currentTime); const [playerError, setPlayerError] = useState<string>(); const [ready, setReady] = useState(false);
  const playerElement = useRef<HyperframesPlayer | undefined>(undefined);
  const compositionReloadKey = useMemo(() => previewCompositionReloadKey(project), [project]);
  const requestedPlayerSource = useRef(""); requestedPlayerSource.current = `/api/projects/${encodeURIComponent(project.id)}/composition?revision=${project.revision}`;
  const previewAudio = useRef(new Map<string, HTMLAudioElement>()); const timelineRef = useRef(timeline); const projectRef = useRef(project); const mediaRef = useRef(media); const playingRef = useRef(playing); const onSelectTargetRef = useRef(onSelectTarget);
  const lastUiUpdateMs = useRef(0);
  resumeAt.current = currentTime;
  timelineRef.current = timeline; projectRef.current = project; mediaRef.current = media; playingRef.current = playing; onSelectTargetRef.current = onSelectTarget;
  const pausePreviewAudio = useCallback(() => { for (const audio of previewAudio.current.values()) audio.pause(); }, []);
  const syncPreviewAudio = useCallback((timeSeconds: number, shouldPlay: boolean) => {
    for (const segment of timelineRef.current.segments) {
      const audio = previewAudio.current.get(`speech:${segment.blockId}`); const speech = segment.speech; if (!audio || !speech) continue;
      const role = segment.roles.speech; const relativeTime = timeSeconds - role.startSeconds; const active = relativeTime >= 0 && relativeTime < role.durationSeconds;
      if (!active) { audio.pause(); continue; }
      const sourceTime = role.sourceStartSeconds + relativeTime;
      if (Math.abs(audio.currentTime - sourceTime) > .12) { try { audio.currentTime = sourceTime; } catch { /* metadata is still loading */ } }
      if (!shouldPlay) { audio.pause(); continue; }
      if (audio.paused) void audio.play().catch(() => setPlayerError("The editor audio could not start. Check browser audio permissions and try Play again."));
    }
    const assets = new Map(mediaRef.current.map((asset) => [asset.id, asset]));
    for (const item of projectRef.current.editorState.timeline.items.filter((entry) => entry.kind === "audio" && !entry.hidden)) {
      const audio = previewAudio.current.get(`item:${item.id}`); const asset = item.assetId ? assets.get(item.assetId) : undefined; if (!audio || !asset || item.muted) { audio?.pause(); continue; }
      const relativeTime = timeSeconds - item.startSeconds; const active = relativeTime >= 0 && relativeTime < item.durationSeconds; if (!active) { audio.pause(); continue; }
      let sourceTime = item.sourceStartSeconds + relativeTime * item.playbackRate; if (item.loop && asset.durationSeconds > 0) sourceTime %= asset.durationSeconds;
      if (Math.abs(audio.currentTime - sourceTime) > .12) { try { audio.currentTime = sourceTime; } catch { /* metadata is still loading */ } }
      audio.volume = item.volume; audio.playbackRate = item.playbackRate; if (!shouldPlay) { audio.pause(); continue; }
      if (audio.paused) void audio.play().catch(() => setPlayerError("Timeline audio could not start. Check browser audio permissions and try Play again."));
    }
  }, []);
  useEffect(() => {
    let disposed = false; let player: HyperframesPlayer | undefined; const cleanup: Array<() => void> = [];
    void import("@hyperframes/player").then(() => {
      if (disposed || !host.current) return;
      player = document.createElement("hyperframes-player") as HyperframesPlayer;
      playerElement.current = player;
      player.setAttribute("src", requestedPlayerSource.current);
      player.setAttribute("width", String(project.editorState.canvas.width)); player.setAttribute("height", String(project.editorState.canvas.height));
      player.style.display = "block"; player.style.width = "100%"; player.style.height = "100%";
      const play = () => { if (!player) return; playingRef.current = true; player.play(); };
      const pause = () => { playingRef.current = false; player?.pause(); };
      const seek = (seconds: number) => { playingRef.current = false; player?.seek(seconds); syncPreviewAudio(seconds, false); syncPreviewVideoLifecycle(player, seconds, "seek"); };
      const adapter: ProjectPlayerAdapter = { play, pause, seek,
        currentTime: () => player?.currentTime ?? 0, duration: () => player?.duration ?? timeline.durationSeconds };
      const listen = (name: string, callback: EventListener) => { player!.addEventListener(name, callback); cleanup.push(() => player?.removeEventListener(name, callback)); };
      listen("ready", ((event: Event) => {
        const duration = (event as CustomEvent<{ duration: number }>).detail.duration;
        const target = Math.min(resumeAt.current, duration); player!.muted = true; seek(target);
        void preparePreviewMedia(player).then(() => { if (disposed) return; setReady(true); onAdapter(adapter); });
      }) as EventListener);
      listen("timeupdate", ((event: CustomEvent<{ currentTime: number }>) => {
        const now = performance.now();
        if (!playingRef.current || now - lastUiUpdateMs.current >= UI_UPDATE_INTERVAL_MS) { lastUiUpdateMs.current = now; onTime(event.detail.currentTime); }
        syncPreviewAudio(event.detail.currentTime, playingRef.current);
      }) as EventListener);
      listen("play", (() => { playingRef.current = true; syncPreviewAudio(player?.currentTime ?? 0, true); syncPreviewVideoLifecycle(player, player?.currentTime ?? 0, "play"); onPlaying(true); }) as EventListener);
      listen("pause", (() => { playingRef.current = false; pausePreviewAudio(); syncPreviewVideoLifecycle(player, player?.currentTime ?? 0, "pause"); onPlaying(false); }) as EventListener);
      listen("ended", (() => { playingRef.current = false; pausePreviewAudio(); syncPreviewVideoLifecycle(player, player?.currentTime ?? 0, "pause"); onPlaying(false); }) as EventListener);
      listen("playbackerror", (() => setPlayerError("The preview audio could not start. Check browser audio permissions and try Play again.")) as EventListener);
      listen("error", ((event: CustomEvent<{ message?: string }>) => setPlayerError(event.detail?.message || "The HyperFrames preview could not load.")) as EventListener);
      host.current.replaceChildren(player); setReady(false); setPlayerError(undefined); onAdapter(adapter);
    }).catch((cause) => setPlayerError(cause instanceof Error ? cause.message : String(cause)));
    return () => { disposed = true; cleanup.forEach((remove) => remove()); pausePreviewAudio(); syncPreviewVideoLifecycle(player, player?.currentTime ?? 0, "pause"); player?.remove(); if (playerElement.current === player) playerElement.current = undefined; onAdapter(undefined); };
  }, [compositionReloadKey, project.id, project.editorState.canvas.width, project.editorState.canvas.height, timeline.durationSeconds, onAdapter, onPlaying, onTime, pausePreviewAudio, syncPreviewAudio]);
  useEffect(() => { syncPreviewTransforms(playerElement.current, project); }, [project]);

  const activeIndex = Math.max(0, timeline.segments.findIndex((segment) => currentTime >= segment.startSeconds && currentTime < segment.endSeconds));
  function jump(direction: -1 | 1) {
    if (!timeline.segments.length) return; const index = Math.max(0, Math.min(timeline.segments.length - 1, activeIndex + direction)); const segment = timeline.segments[index];
    onSelectLine(segment.blockId); onTime(segment.startSeconds);
  }
  return <section className="dialogue-preview-panel">
    <header className="hf-preview-head"><div><strong>Preview</strong><span>{timeline.durationSeconds.toFixed(1)}s · {project.editorState.canvas.width} × {project.editorState.canvas.height} · {project.editorState.canvas.fps} fps</span></div><span className={timeline.segments.every((segment) => segment.speech) && timeline.segments.length ? "ready" : "pending"}>{timeline.segments.filter((segment) => segment.speech).length}/{timeline.segments.length} audio ready</span></header>
    <div className="hf-player-shell" style={{ aspectRatio: `${project.editorState.canvas.width} / ${project.editorState.canvas.height}` }}><div ref={host} className="hf-player-host" /><CanvasSelectionLayer project={project} timeline={timeline} currentTime={currentTime} onSelect={onSelectTargetRef.current} />{selectedTarget && <CanvasTransformOverlay project={project} timeline={timeline} target={selectedTarget} currentTime={currentTime} onPreview={(target, transform) => applyPreviewTransform(playerElement.current, target, transform)} onChange={onTransform} />}{playerError && <div className="hf-player-error">{playerError}</div>}</div>
    <div hidden aria-hidden="true">{timeline.segments.map((segment) => segment.speech ? <audio key={`${segment.blockId}:${segment.speech.id}`} data-preview-line={segment.blockId} ref={(element) => { const key = `speech:${segment.blockId}`; if (element) previewAudio.current.set(key, element); else previewAudio.current.delete(key); }} src={segment.speech.audioUrl} preload="auto" /> : null)}{project.editorState.timeline.items.filter((item) => item.kind === "audio" && !item.hidden).map((item) => { const asset = media.find((entry) => entry.id === item.assetId); return asset ? <audio key={item.id} data-preview-item={item.id} ref={(element) => { const key = `item:${item.id}`; if (element) previewAudio.current.set(key, element); else previewAudio.current.delete(key); }} src={asset.mediaUrl} preload="auto" /> : null; })}</div>
    <footer className="hf-player-controls"><div className="hf-transport"><button aria-label="Previous dialogue line" title="Previous line" onClick={() => jump(-1)}><SkipBack size={13} /></button><button className="hf-play" aria-label={playing ? "Pause" : "Play"} disabled={!ready} onClick={() => playing ? adapterPause(playerElement.current, playingRef) : adapterPlay(playerElement.current, playingRef)}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button aria-label="Next dialogue line" title="Next line" onClick={() => jump(1)}><SkipForward size={13} /></button><time>{formatTime(currentTime)} / {formatTime(timeline.durationSeconds)}</time></div></footer>
  </section>;
}

function adapterPlay(player: HyperframesPlayer | undefined, playing: React.MutableRefObject<boolean>) { if (!player) return; playing.current = true; player.play(); }
function adapterPause(player: HyperframesPlayer | undefined, playing: React.MutableRefObject<boolean>) { playing.current = false; player?.pause(); }

function playerDocument(player: HyperframesPlayer | undefined): Document | undefined {
  try { return player?.iframeElement?.contentDocument ?? player?.shadowRoot?.querySelector("iframe")?.contentDocument ?? undefined; } catch { return undefined; }
}

function previewCompositionReloadKey(project: ProjectRecord) {
  const state = project.editorState;
  return JSON.stringify({ ...state,
    blocks: state.blocks.map((block) => block.kind === "dialogue-line" && block.timeline ? { ...block, timeline: { ...block.timeline, transform: undefined } } : block),
    timeline: { ...state.timeline, items: state.timeline.items.map((item) => ({ ...item, transform: undefined })) },
  });
}

function syncPreviewTransforms(player: HyperframesPlayer | undefined, project: ProjectRecord) {
  for (const block of project.editorState.blocks) {
    if (block.kind !== "dialogue-line" || !block.timeline?.transform) continue;
    applyPreviewTransform(player, { kind: "dialogue", lineId: block.id, role: "character", linked: true }, block.timeline.transform);
  }
  for (const item of project.editorState.timeline.items) if (item.kind !== "audio") applyPreviewTransform(player, { kind: "item", itemId: item.id }, item.transform);
}

function applyPreviewTransform(player: HyperframesPlayer | undefined, target: TimelineEditTarget, transform: ProjectElementTransform) {
  const selector = target.kind === "item" ? `[data-hf-id="item:${cssEscape(target.itemId)}"]` : `[data-hf-id="dialogue:${cssEscape(target.lineId)}:character"]`;
  const element = playerDocument(player)?.querySelector<HTMLElement>(selector); const shell = element?.closest<HTMLElement>(".authored-shell") ?? element; if (!shell) return;
  shell.style.left = `${transform.xPercent}%`; shell.style.top = `${transform.yPercent}%`; shell.style.width = `${transform.widthPercent}%`; shell.style.height = `${transform.heightPercent}%`;
  shell.style.opacity = String(transform.opacity); shell.style.zIndex = String(transform.zIndex); shell.style.transform = `translate(-50%,-50%) rotate(${transform.rotationDegrees}deg)`;
}

function cssEscape(value: string) { return CSS.escape(value); }

function syncPreviewVideoLifecycle(player: HyperframesPlayer | undefined, timeSeconds: number, action: "play" | "pause" | "seek") {
  for (const video of playerDocument(player)?.querySelectorAll<HTMLVideoElement>("video[data-start]") ?? []) {
    const start = finiteDatasetNumber(video.dataset.start, 0); const duration = finiteDatasetNumber(video.dataset.duration, Number.POSITIVE_INFINITY);
    const relativeTime = timeSeconds - start; const active = relativeTime >= 0 && relativeTime < duration;
    if (!active || action === "pause") { video.pause(); continue; }
    const mediaStart = finiteDatasetNumber(video.dataset.mediaStart, 0); const playbackRate = Math.max(.01, finiteDatasetNumber(video.dataset.playbackRate, 1));
    video.playbackRate = playbackRate;
    let sourceTime = mediaStart + relativeTime * playbackRate;
    if (video.loop && Number.isFinite(video.duration) && video.duration > 0) sourceTime = ((sourceTime % video.duration) + video.duration) % video.duration;
    else if (Number.isFinite(video.duration) && video.duration > 0) sourceTime = Math.min(sourceTime, Math.max(0, video.duration - .01));
    const align = () => {
      if (action === "seek" || Math.abs(video.currentTime - sourceTime) > .5) { try { video.currentTime = sourceTime; } catch { /* metadata is still loading */ } }
      if (action === "seek") video.pause(); else if (video.paused) void video.play().catch(() => undefined);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) align(); else video.addEventListener("loadedmetadata", align, { once: true });
  }
}

function finiteDatasetNumber(value: string | undefined, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

async function preparePreviewMedia(player: HyperframesPlayer | undefined): Promise<void> {
  const document = playerDocument(player); if (!document) return;
  const images = [...document.images]; const videos = [...document.querySelectorAll<HTMLVideoElement>("video[data-start]")];
  for (const video of videos) video.preload = "auto";
  await Promise.all([
    ...images.map((image) => image.complete ? image.decode().catch(() => undefined) : waitForImage(image)),
    ...videos.map((video) => waitForVideo(video)),
  ]);
}

function CanvasSelectionLayer({ project, timeline, currentTime, onSelect }: { project: ProjectRecord; timeline: CompiledDialogueTimeline; currentTime: number; onSelect: (target: TimelineEditTarget) => void }) {
  const dialogue = timeline.segments.filter((segment) => currentTime >= segment.roles.character.startSeconds && currentTime < segment.roles.character.startSeconds + segment.roles.character.durationSeconds).map((segment) => {
    const block = project.editorState.blocks.find((entry) => entry.id === segment.blockId); const transform = block?.timeline?.transform ?? defaultDialogueCharacterTransform(segment.data.position);
    return { key: `dialogue:${segment.blockId}`, target: { kind: "dialogue", lineId: segment.blockId, role: "character", linked: true } as TimelineEditTarget, transform, label: "Select dialogue character on canvas" };
  });
  const items = project.editorState.timeline.items.filter((item) => !item.hidden && item.kind !== "audio" && currentTime >= item.startSeconds && currentTime < item.startSeconds + item.durationSeconds).map((item) => ({ key: `item:${item.id}`, target: { kind: "item", itemId: item.id } as TimelineEditTarget, transform: item.transform, label: `Select ${item.kind} on canvas` }));
  return <div className="canvas-selection-layer">{[...dialogue, ...items].map((entry) => <button key={entry.key} aria-label={entry.label} title="Click to select, then drag to move" style={{ left: `${entry.transform.xPercent}%`, top: `${entry.transform.yPercent}%`, width: `${entry.transform.widthPercent}%`, height: `${entry.transform.heightPercent}%`, transform: `translate(-50%,-50%) rotate(${entry.transform.rotationDegrees}deg)`, zIndex: entry.transform.zIndex }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(entry.target); }} />)}</div>;
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { image.removeEventListener("load", done); image.removeEventListener("error", done); void image.decode().catch(() => undefined).finally(resolve); };
    image.addEventListener("load", done, { once: true }); image.addEventListener("error", done, { once: true });
    window.setTimeout(done, MEDIA_WARMUP_TIMEOUT_MS);
  });
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("canplay", done); video.removeEventListener("error", done); resolve(); };
    video.addEventListener("canplay", done, { once: true }); video.addEventListener("error", done, { once: true });
    window.setTimeout(done, MEDIA_WARMUP_TIMEOUT_MS);
  });
}

function CanvasTransformOverlay({ project, timeline, target, currentTime, onPreview, onChange }: { project: ProjectRecord; timeline: CompiledDialogueTimeline; target: TimelineEditTarget; currentTime: number; onPreview: (target: TimelineEditTarget, transform: ProjectElementTransform) => void; onChange: (target: TimelineEditTarget, transform: ProjectElementTransform) => Promise<void> }) {
  const item = target.kind === "item" ? project.editorState.timeline.items.find((entry) => entry.id === target.itemId) : undefined; const block = target.kind === "dialogue" ? project.editorState.blocks.find((entry) => entry.id === target.lineId) : undefined; const segment = target.kind === "dialogue" ? timeline.segments.find((entry) => entry.blockId === target.lineId) : undefined; const position = segment?.data.position ?? "center";
  const persisted = item?.transform ?? block?.timeline?.transform ?? defaultDialogueCharacterTransform(position);
  const [draft, setDraft] = useState(persisted); useEffect(() => setDraft(persisted), [persisted.xPercent, persisted.yPercent, persisted.widthPercent, persisted.heightPercent, persisted.rotationDegrees, persisted.opacity, persisted.zIndex]);
  const timingWindow = item ?? (target.kind === "dialogue" ? segment?.roles[target.role] : undefined); const visual = item ? item.kind !== "audio" : target.kind === "dialogue" && target.role === "character";
  if (!timingWindow || !visual || currentTime < timingWindow.startSeconds || currentTime >= timingWindow.startSeconds + timingWindow.durationSeconds) return null;
  function begin(event: React.PointerEvent, operation: "move" | "resize") { event.preventDefault(); event.stopPropagation(); const shell = event.currentTarget.closest<HTMLElement>(".hf-player-shell"); if (!shell) return; const rect = shell.getBoundingClientRect(); const initial = draft; const startX = event.clientX; const startY = event.clientY;
    const move = (next: PointerEvent) => { const dx = (next.clientX - startX) / rect.width * 100; const dy = (next.clientY - startY) / rect.height * 100; const value = operation === "move" ? { ...initial, xPercent: initial.xPercent + dx, yPercent: initial.yPercent + dy } : { ...initial, widthPercent: Math.max(2, initial.widthPercent + dx * 2), heightPercent: Math.max(2, initial.heightPercent + dy * 2) }; setDraft(value); onPreview(target, value); };
    const up = (next: PointerEvent) => { move(next); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); const dx = (next.clientX - startX) / rect.width * 100; const dy = (next.clientY - startY) / rect.height * 100; const value = operation === "move" ? { ...initial, xPercent: initial.xPercent + dx, yPercent: initial.yPercent + dy } : { ...initial, widthPercent: Math.max(2, initial.widthPercent + dx * 2), heightPercent: Math.max(2, initial.heightPercent + dy * 2) }; void onChange(target, value); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true });
  }
  return <div className="canvas-transform-layer"><div className="canvas-transform-box" style={{ left: `${draft.xPercent}%`, top: `${draft.yPercent}%`, width: `${draft.widthPercent}%`, height: `${draft.heightPercent}%`, transform: `translate(-50%,-50%) rotate(${draft.rotationDegrees}deg)` }} onPointerDown={(event) => begin(event, "move")}><span>{item?.kind === "character-pose" ? "Pose" : item ? item.kind : "Character"}</span><button aria-label="Resize selected element" onPointerDown={(event) => begin(event, "resize")} /></div></div>;
}

function formatTime(seconds: number) { const safe = Math.max(0, seconds); const minutes = Math.floor(safe / 60); return `${minutes}:${(safe % 60).toFixed(1).padStart(4, "0")}`; }
