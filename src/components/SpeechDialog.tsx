import { Clock3, Cloud, LoaderCircle, Play, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SpeechClipRecord, SpeechRuntimeStatus, TextToSpeechSpeed, VoiceRecord } from "../shared/contracts";
import { dialogueApi } from "../lib/client-api";
import { ProviderLogo } from "./ProviderLogo";

export function SpeechDialog({ voice, onClose }: { voice: VoiceRecord; onClose: () => void }) {
  const [text, setText] = useState("Welcome back. Today, we are turning a simple conversation into a story worth watching.");
  const [speed, setSpeed] = useState<TextToSpeechSpeed>("fast");
  const [clips, setClips] = useState<SpeechClipRecord[]>();
  const [runtime, setRuntime] = useState<SpeechRuntimeStatus>();
  const [busy, setBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastGenerationSeconds, setLastGenerationSeconds] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialogueApi.speech.list(voice.id).then(setClips).catch((cause) => setError(readError(cause)));
    const refresh = () => dialogueApi.speech.runtime(voice.id).then(setRuntime).catch(() => setRuntime({ provider: voice.provider, execution: "remote", detail: "Provider status could not be inspected.", estimate: "Elapsed time will be shown after generation starts." }));
    void refresh();
  }, [voice.id]);

  useEffect(() => {
    if (!busy) return;
    const startedAt = performance.now(); setElapsedSeconds(0);
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function generate() {
    if (!text.trim()) return; const startedAt = performance.now(); setBusy(true); setLastGenerationSeconds(undefined); setError(undefined);
    try { const clip = await dialogueApi.speech.generate({ voiceId: voice.id, text, speed }); setClips((current) => [clip, ...(current ?? [])]); setLastGenerationSeconds((performance.now() - startedAt) / 1000); setRuntime(await dialogueApi.speech.runtime(voice.id)); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try { await dialogueApi.speech.remove(id); setClips((current) => current?.filter((clip) => clip.id !== id)); }
    catch (cause) { setError(readError(cause)); }
  }

  return <div className="modal-backdrop speech-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="modal speech-dialog" role="dialog" aria-modal="true" aria-label={`Generate speech with ${voice.name}`}><header className="modal-header"><div><ProviderLogo provider={voice.provider} size={34} /><div><h2>Generate with {voice.name}</h2></div></div><button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={19} /></button></header><div className="modal-body speech-dialog-body">
    <label className="speech-copy">Dialogue text <span>{text.length}/5,000 characters</span><textarea autoFocus rows={5} maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} /></label>
    <div className="speech-options"><div><strong>Speaking speed</strong><span>DialogueLab used fast speech by default.</span></div><div className="speed-picker">{(["slow", "normal", "fast"] as TextToSpeechSpeed[]).map((option) => <button key={option} className={speed === option ? "active" : ""} onClick={() => setSpeed(option)}>{option}</button>)}</div></div>
    <div className="speech-generate-row"><div className={`speech-runtime-summary ${runtime?.execution || "unknown"}`}><span><Cloud size={16} /></span><div><strong>{busy ? `Generating · ${formatElapsed(elapsedSeconds)} elapsed` : lastGenerationSeconds ? `Finished in ${formatElapsed(Math.round(lastGenerationSeconds))}` : runtimeLabel(runtime)}</strong><small>{busy ? `${runtimeLabel(runtime)} · ${runtime?.estimate || "No exact ETA is available yet."}` : runtime ? `${runtime.detail} ${runtime.estimate}` : "Checking where this voice will run…"}</small></div></div><button className="primary-button" disabled={!text.trim() || busy} onClick={() => void generate()}>{busy ? <><LoaderCircle className="spin" size={16} /> Generating…</> : <><Play size={15} fill="currentColor" /> Generate speech</>}</button></div>
    {error && <div className="form-error">{error}</div>}
    <section className="speech-history"><div className="speech-history-heading"><div><h3>Generated clips</h3><p>These clips will be reusable on dialogue lines.</p></div><span>{clips?.length ?? 0}</span></div>
      {!clips ? <div className="speech-loading"><LoaderCircle className="spin" size={17} /> Loading…</div> : clips.length ? clips.map((clip) => <article key={clip.id}><audio controls preload="metadata" src={clip.audioUrl} /><div className="speech-clip-copy"><strong>{clip.text}</strong><span><Clock3 size={11} /> {formatDuration(clip.durationSeconds)} · {clip.words.length} timed words · {timingLabel(clip.timingSource)} · {clip.speed}</span></div><button className="icon-button small" aria-label="Remove speech clip" onClick={() => void remove(clip.id)}><Trash2 size={15} /></button></article>) : <div className="speech-empty">Generate a line to test this voice.</div>}
    </section>
  </div></section></div>;
}

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`; }
function formatElapsed(seconds: number) { return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function runtimeLabel(status?: SpeechRuntimeStatus) { return status ? "Provider cloud" : "Checking provider…"; }
function timingLabel(source: SpeechClipRecord["timingSource"]) { return source === "whisper" ? "word timing" : source === "elevenlabs" ? "ElevenLabs Scribe" : source === "provider" ? "provider timing" : "estimated timing"; }
function readError(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
