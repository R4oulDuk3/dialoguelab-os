"use client";

import type { HyperframesPlayer } from "@hyperframes/player";
import { Check, ChevronDown, LoaderCircle, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectClipMotion, ProjectMotionConfig } from "@/shared/contracts";
import { MOTION_PHASES, MOTION_PRESETS, motionPresetName, type MotionPhase, type MotionPresetOption } from "@/shared/motion-catalog";
import { normalizeProjectMotion } from "@/shared/project-timeline";
import { ModalPortal } from "./ModalPortal";

export type AnimationApplyScope = "element" | "character" | "all";

export interface AnimationPickerSubject {
  label: string;
  detail: string;
  assetKind: "image" | "video";
  assetUrl?: string;
  previewFit?: "character" | "canvas";
  motion?: ProjectClipMotion;
  characterScopes?: boolean;
}

export function AnimationPickerDialog({ subject, onClose, onApply }: {
  subject: AnimationPickerSubject;
  onClose: () => void;
  onApply: (motion: ProjectClipMotion, scope: AnimationApplyScope) => Promise<void>;
}) {
  const [phase, setPhase] = useState<MotionPhase>("entrance"); const [motion, setMotion] = useState(() => normalizeProjectMotion(subject.motion));
  const [scope, setScope] = useState<AnimationApplyScope>("element"); const [scopeMenuOpen, setScopeMenuOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const scopeMenuRef = useRef<HTMLDivElement>(null);
  const phaseCopy = MOTION_PHASES.find((item) => item.id === phase)!; const active = motion[phase];
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const keyboard = (event: KeyboardEvent) => { if (event.key !== "Escape" || busy) return; if (scopeMenuOpen) setScopeMenuOpen(false); else onClose(); }; window.addEventListener("keydown", keyboard); return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", keyboard); }; }, [busy, onClose, scopeMenuOpen]);
  useEffect(() => { if (!scopeMenuOpen) return; const close = (event: PointerEvent) => { if (!scopeMenuRef.current?.contains(event.target as Node)) setScopeMenuOpen(false); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [scopeMenuOpen]);

  function selectPreset(option: MotionPresetOption) {
    setMotion((current) => {
      const next = normalizeProjectMotion(current); next[phase] = { ...next[phase], preset: option.id };
      if (phase === "combo" && option.id !== "none") {
        next.entrance = { ...next.entrance, preset: "none" }; next.during = { ...next.during, preset: "none" }; next.exit = { ...next.exit, preset: "none" };
      } else if (phase !== "combo" && option.id !== "none") next.combo = { ...next.combo, preset: "none" };
      return next;
    });
  }
  function setSpeed(speed: "fast" | "standard" | "slow") {
    const values = phase === "during" ? { fast: [.55, "snappy"], standard: [.9, "smooth"], slow: [1.5, "gentle"] } : { fast: [.3, "snappy"], standard: [.5, "smooth"], slow: [.8, "gentle"] };
    const [durationSeconds, easing] = values[speed] as [number, ProjectMotionConfig["easing"]]; setMotion((current) => ({ ...current, [phase]: { ...current[phase], durationSeconds, easing } }));
  }
  const speed = active.durationSeconds <= (phase === "during" ? .65 : .35) ? "fast" : active.durationSeconds >= (phase === "during" ? 1.25 : .7) ? "slow" : "standard";
  const scopeOptions: Array<{ value: AnimationApplyScope; label: string; detail: string }> = [
    { value: "element", label: "This line", detail: "Only the selected dialogue line" },
    { value: "character", label: "This character", detail: "Every line using this character" },
    { value: "all", label: "All lines", detail: "Every dialogue line in the project" },
  ];
  async function apply(targetScope: AnimationApplyScope = scope) { setScopeMenuOpen(false); setBusy(true); setError(undefined); try { await onApply(motion, targetScope); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }

  return <ModalPortal><div className="animation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="animation-modal" role="dialog" aria-modal="true" aria-labelledby="animation-modal-title">
      <header className="animation-modal-header"><span><Sparkles size={18} /></span><div><h2 id="animation-modal-title">Choose animation</h2><p>{subject.label} <b>·</b> {subject.detail}</p></div><button aria-label="Close animation picker" disabled={busy} onClick={onClose}><X size={19} /></button></header>
      <div className="animation-modal-body">
        <div className="animation-preview-column"><MotionPreview subject={subject} phase={phase} config={active} /><div className="animation-preview-caption"><div><small>Live HyperFrames preview</small><strong>{motionPresetName(active.preset)}</strong></div><span>{phaseCopy.description}</span></div></div>
        <div className="animation-choices">
          <nav className="animation-phase-tabs" aria-label="Animation phase">{MOTION_PHASES.map((item) => <button key={item.id} className={phase === item.id ? "active" : ""} onClick={() => setPhase(item.id)}><span>{item.shortName}</span>{motion[item.id].preset !== "none" && <i />}</button>)}</nav>
          <div className="animation-choice-heading"><div><h3>{phaseCopy.name}</h3><p>{phaseCopy.description} Select a style to preview it.</p></div>{phase !== "combo" && <div className="animation-speed" aria-label="Animation speed"><span>Speed</span>{(["fast","standard","slow"] as const).map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value === "standard" ? "Normal" : value[0].toUpperCase() + value.slice(1)}</button>)}</div>}</div>
          <div className="animation-preset-grid">{MOTION_PRESETS[phase].map((option) => <button key={option.id} className={active.preset === option.id ? "selected" : ""} aria-pressed={active.preset === option.id} onClick={() => selectPreset(option)}><MotionCue option={option} /><span><strong>{option.name}</strong><small>{option.description}</small></span>{active.preset === option.id && <i className="animation-selected-check"><Check size={12} /></i>}</button>)}</div>
        </div>
      </div>
      <footer className="animation-modal-footer"><button className="animation-clear" disabled={busy} onClick={() => setMotion(normalizeProjectMotion())}><RotateCcw size={14} /> Clear all animation</button>{subject.characterScopes ? <div ref={scopeMenuRef} className="animation-apply-scope"><button type="button" className="animation-apply-selection" disabled={busy} aria-haspopup="menu" aria-expanded={scopeMenuOpen} onClick={() => setScopeMenuOpen((open) => !open)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}<strong>{busy ? "Applying…" : "Apply Selection"}</strong><ChevronDown size={16} /></button>{scopeMenuOpen && <div className="animation-apply-scope-menu" role="menu" aria-label="Apply animation to">{scopeOptions.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={scope === option.value} className={scope === option.value ? "active" : ""} onClick={() => { setScope(option.value); void apply(option.value); }}><span className="animation-scope-check">{scope === option.value && <Check size={13} />}</span><span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div>}</div> : <button className="animation-apply-selection standalone" disabled={busy} onClick={() => void apply()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}<strong>{busy ? "Applying…" : "Apply Selection"}</strong></button>}</footer>
      {error && <div className="animation-modal-error">{error}</div>}
    </section>
  </div></ModalPortal>;
}

function MotionPreview({ subject, phase, config }: { subject: AnimationPickerSubject; phase: MotionPhase; config: ProjectMotionConfig }) {
  const host = useRef<HTMLDivElement>(null); const playerRef = useRef<HyperframesPlayer | undefined>(undefined); const [ready, setReady] = useState(false); const [error, setError] = useState(false);
  const src = useMemo(() => { const params = new URLSearchParams({ phase, preset: config.preset, duration: String(config.durationSeconds), easing: config.easing, direction: config.direction, kind: subject.assetKind, label: subject.label }); if (subject.assetUrl) params.set("asset", subject.assetUrl); if (subject.previewFit === "character") params.set("fit", "character"); return `/api/hyperframes/motion-preview?${params}`; }, [config.direction, config.durationSeconds, config.easing, config.preset, phase, subject.assetKind, subject.assetUrl, subject.label, subject.previewFit]);
  useEffect(() => { let disposed = false; let player: HyperframesPlayer | undefined; const cleanup: Array<() => void> = []; setReady(false); setError(false);
    void import("@hyperframes/player").then(() => { if (disposed || !host.current) return; player = document.createElement("hyperframes-player") as HyperframesPlayer; playerRef.current = player; player.setAttribute("src", src); player.setAttribute("width", "720"); player.setAttribute("height", "405"); player.style.display = "block"; player.style.width = "100%"; player.style.height = "100%";
      const listen = (name: string, callback: EventListener) => { player!.addEventListener(name, callback); cleanup.push(() => player?.removeEventListener(name, callback)); };
      listen("ready", (() => { setReady(true); player?.seek(0); player?.play(); }) as EventListener); listen("error", (() => setError(true)) as EventListener); host.current.replaceChildren(player);
    }).catch(() => setError(true)); return () => { disposed = true; cleanup.forEach((remove) => remove()); player?.remove(); if (playerRef.current === player) playerRef.current = undefined; };
  }, [src]);
  return <div className="animation-preview-stage"><div ref={host} className="animation-preview-host" />{!ready && !error && <div className="animation-preview-loading"><LoaderCircle className="spin" size={18} /> Loading preview</div>}{error && <div className="animation-preview-loading">Preview unavailable</div>}<button aria-label="Replay animation" title="Replay animation" disabled={!ready} onClick={() => { playerRef.current?.seek(0); playerRef.current?.play(); }}><Play size={14} fill="currentColor" /> Replay</button></div>;
}

function MotionCue({ option }: { option: MotionPresetOption }) {
  return <span className={`motion-cue cue-${option.cue}`} aria-hidden><i className="motion-cue-object" /><i className="motion-cue-path" /></span>;
}
