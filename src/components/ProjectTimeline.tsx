"use client";

import { ChevronDown, ChevronUp, Minus, Plus, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompiledDialogueTimeline } from "@/shared/project-timeline";
import type { DialogueLineData, ProjectEditorState, SpeechClipRecord } from "@/shared/contracts";

const LABEL_WIDTH = 92;

export function ProjectTimeline({ timeline, state, speech, selectedLineId, currentTime, onSelect, onSeek, onReorder, onGap }:
  { timeline: CompiledDialogueTimeline; state: ProjectEditorState; speech: SpeechClipRecord[]; selectedLineId?: string; currentTime: number;
    onSelect: (lineId: string) => void; onSeek: (seconds: number) => void; onReorder: (lineIds: string[]) => Promise<void>; onGap: (lineId: string, seconds: number) => Promise<void> }) {
  const [expanded, setExpanded] = useState(true); const [zoom, setZoom] = useState(1); const [dragging, setDragging] = useState<string>(); const scroll = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = 64 * zoom; const contentWidth = Math.max(560, timeline.durationSeconds * pixelsPerSecond + 80); const seconds = Math.max(1, Math.ceil(timeline.durationSeconds));
  const lineIds = timeline.segments.map((segment) => segment.blockId); const speechIds = new Set(speech.map((clip) => clip.id));
  function seekAt(clientX: number) { const box = scroll.current?.getBoundingClientRect(); if (!box || !scroll.current) return; const x = clientX - box.left + scroll.current.scrollLeft - LABEL_WIDTH; onSeek(Math.max(0, Math.min(timeline.durationSeconds, x / pixelsPerSecond))); }
  async function drop(target: string) { if (!dragging || dragging === target) return; const next = [...lineIds]; const from = next.indexOf(dragging); const to = next.indexOf(target); next.splice(from, 1); next.splice(to, 0, dragging); setDragging(undefined); await onReorder(next); }
  return <section className={`project-timeline ${expanded ? "expanded" : "collapsed"}`} onKeyDown={(event) => {
    if (event.target instanceof HTMLInputElement) return; if (event.code === "Space") { event.preventDefault(); return; }
    const step = event.shiftKey ? 1 : 1 / state.canvas.fps; if (event.key === "ArrowLeft") onSeek(Math.max(0, currentTime - step)); if (event.key === "ArrowRight") onSeek(Math.min(timeline.durationSeconds, currentTime + step));
  }} tabIndex={0}>
    <header><button className="timeline-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />} Timeline</button><time>{formatTime(currentTime)}</time><div className="timeline-zoom"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.25, value - .25))}><Minus size={12} /></button><input aria-label="Timeline zoom" type="range" min={.25} max={4} step={.25} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value + .25))}><Plus size={12} /></button><button title="Fit project" onClick={() => { const width = Math.max(300, (scroll.current?.clientWidth ?? 600) - LABEL_WIDTH - 40); setZoom(Math.max(.25, Math.min(4, width / Math.max(1, timeline.durationSeconds) / 64))); }}><ScanLine size={13} /></button></div></header>
    {expanded && <div ref={scroll} className="timeline-scroll">
      <div className="timeline-canvas" style={{ width: contentWidth + LABEL_WIDTH }}>
        <div className="timeline-ruler-label">Tracks</div><div className="timeline-ruler" style={{ left: LABEL_WIDTH, width: contentWidth }} onPointerDown={(event) => seekAt(event.clientX)}>{Array.from({ length: seconds + 1 }, (_, second) => <span key={second} style={{ left: second * pixelsPerSecond }}><i />{formatTick(second)}</span>)}</div>
        {(["background", "characters", "speech", "captions"] as const).map((trackId, row) => {
          const track = timeline.tracks.find((item) => item.id === trackId); return <div className="timeline-row" style={{ top: 30 + row * 46 }} key={trackId}><div className="timeline-track-label">{trackId === "background" ? "Background" : trackId[0].toUpperCase() + trackId.slice(1)}{trackId === "background" && <small>Locked</small>}</div><div className="timeline-track" style={{ left: LABEL_WIDTH, width: contentWidth }} onPointerDown={(event) => { if (event.target === event.currentTarget) seekAt(event.clientX); }}>
            {track?.clips.map((clip) => {
              const selected = clip.groupId === selectedLineId; const segment = clip.groupId ? timeline.segments.find((item) => item.blockId === clip.groupId) : undefined;
              return <button key={clip.id} className={`timeline-clip ${clip.kind} ${selected ? "selected" : ""} ${segment && !segment.speech ? "estimated" : ""}`} style={{ left: clip.startSeconds * pixelsPerSecond, width: Math.max(8, clip.durationSeconds * pixelsPerSecond) }}
                draggable={Boolean(clip.groupId)} onDragStart={() => setDragging(clip.groupId)} onDragOver={(event) => event.preventDefault()} onDrop={() => clip.groupId && void drop(clip.groupId)} onClick={() => clip.groupId && onSelect(clip.groupId)} title={`${clip.kind} · ${clip.startSeconds.toFixed(2)}s · ${clip.durationSeconds.toFixed(2)}s`}>
                {clip.kind === "speech" && clip.sourceId && speechIds.has(clip.sourceId) ? <Waveform speechId={clip.sourceId} bars={Math.max(6, Math.min(34, Math.round(clip.durationSeconds * 8)))} /> : <span>{clip.kind === "background-video" ? `${Number(clip.metadata?.mediaStartSeconds ?? 0).toFixed(1)}s offset` : clip.groupId ? `Line ${lineIds.indexOf(clip.groupId) + 1}` : clip.kind}</span>}
              </button>;
            })}
            {trackId === "characters" && timeline.segments.map((segment) => <GapHandle key={segment.blockId} lineId={segment.blockId} start={segment.endSeconds} value={segment.data.gapAfterSeconds} pixelsPerSecond={pixelsPerSecond} onSave={onGap} />)}
          </div></div>;
        })}
        <div className="timeline-playhead" style={{ left: LABEL_WIDTH + currentTime * pixelsPerSecond }}><i /></div>
      </div>
    </div>}
  </section>;
}

function GapHandle({ lineId, start, value, pixelsPerSecond, onSave }: { lineId: string; start: number; value: number; pixelsPerSecond: number; onSave: (lineId: string, seconds: number) => Promise<void> }) {
  const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]);
  return <label className="timeline-gap" style={{ left: start * pixelsPerSecond, width: Math.max(9, draft * pixelsPerSecond) }} title={`Gap after line: ${draft.toFixed(2)}s`}><input data-gap-line={lineId} aria-label={`Gap after dialogue line ${lineId}`} type="range" min={0} max={10} step={.05} value={draft} onChange={(event) => setDraft(Number(event.target.value))} onPointerUp={() => void onSave(lineId, draft)} onKeyUp={() => void onSave(lineId, draft)} /></label>;
}

const waveformCache = new Map<string, number[]>();
function Waveform({ speechId, bars }: { speechId: string; bars: number }) {
  const [samples, setSamples] = useState(() => waveformCache.get(speechId));
  useEffect(() => { let active = true; if (waveformCache.has(speechId)) { setSamples(waveformCache.get(speechId)); return; }
    void fetch(`/api/speech/${encodeURIComponent(speechId)}/waveform`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Waveform unavailable"))).then((body: { samples: number[] }) => { waveformCache.set(speechId, body.samples); if (active) setSamples(body.samples); }).catch(() => undefined); return () => { active = false; }; }, [speechId]);
  const shown = samples ? Array.from({ length: bars }, (_, index) => samples[Math.min(samples.length - 1, Math.floor(index * samples.length / bars))] ?? .25) : Array.from({ length: bars }, () => .25);
  return <span className="waveform">{shown.map((value, index) => <i key={index} style={{ height: `${20 + value * 75}%` }} />)}</span>;
}
function formatTime(seconds: number) { const safe = Math.max(0, seconds); return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(2).padStart(5, "0")}`; }
function formatTick(seconds: number) { return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
