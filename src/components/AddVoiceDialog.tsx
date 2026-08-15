import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, CloudDownload, Copy, FileAudio, LoaderCircle, Mic2, Pause, Play, Sparkles, Upload, X } from "lucide-react";
import type { DesignPreview, ProviderId, ProviderStatus, RemoteVoice, VoiceRecord } from "../shared/contracts";
import { ProviderLogo } from "./ProviderLogo";
import { dialogueApi } from "../lib/client-api";

type Method = "existing" | "clone" | "generate";
interface Props { providers: ProviderStatus[]; onClose: () => void; onAdded: (voice: VoiceRecord) => void; onSettings: () => void; }

export function AddVoiceDialog({ providers, onClose, onAdded, onSettings }: Props) {
  const configured = providers.filter((provider) => provider.configured);
  const [provider, setProvider] = useState<ProviderId>(configured[0]?.id || "elevenlabs");
  const [method, setMethod] = useState<Method>();
  const [error, setError] = useState<string>();
  const capabilities = providers.find((item) => item.id === provider)?.capabilities ?? [];

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal add-voice-modal">
      <header className="modal-header">
        <div>{method && <button className="icon-button" onClick={() => { setMethod(undefined); setError(undefined); }}><ArrowLeft size={18} /></button>}<div><h2>{method ? titles[method] : "Add a voice"}</h2></div></div>
        <button className="icon-button" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="modal-body">
        <ProviderPicker providers={providers} value={provider} onChange={(value) => { setProvider(value); setMethod(undefined); setError(undefined); }} onSettings={onSettings} />
        {!providers.find((item) => item.id === provider)?.configured ? <Disconnected provider={provider} onSettings={onSettings} /> : !method ? (
          <div className="method-grid">
            {capabilities.includes("existing") && <MethodCard icon={<CloudDownload />} title="Add existing voice" description="Choose a voice already available in your provider account." onClick={() => setMethod("existing")} />}
            {capabilities.includes("clone") && <MethodCard icon={<Copy />} title="Clone from audio" description="Create a voice from a clean recording you have permission to use." onClick={() => setMethod("clone")} />}
            {capabilities.includes("design") && <MethodCard icon={<Sparkles />} title="Design a new voice" description="Describe a new voice and generate provider previews." onClick={() => setMethod("generate")} />}
          </div>
        ) : method === "existing" ? <ExistingFlow provider={provider} onAdded={onAdded} setError={setError} /> : method === "clone" ? <CloneFlow provider={provider} onAdded={onAdded} setError={setError} /> : <GenerateFlow provider={provider} onAdded={onAdded} setError={setError} />}
        {error && <div className="form-error sticky-error">{error}</div>}
      </div>
    </section>
  </div>;
}

const titles: Record<Method, string> = { existing: "Add an existing voice", clone: "Clone a voice", generate: "Design a new voice" };

function ProviderPicker({ providers, value, onChange, onSettings }: { providers: ProviderStatus[]; value: ProviderId; onChange: (id: ProviderId) => void; onSettings: () => void }) {
  return <div className="provider-picker"><span>Provider</span><div>{providers.map((provider) => <button key={provider.id} className={value === provider.id ? "selected" : ""} onClick={() => onChange(provider.id)}><ProviderLogo provider={provider.id} size={24} />{provider.name}{provider.configured ? <Check size={14} /> : <i />}</button>)}<button className="manage-providers" onClick={onSettings}>Manage</button></div></div>;
}

function Disconnected({ provider, onSettings }: { provider: ProviderId; onSettings: () => void }) {
  return <div className="empty-state"><ProviderLogo provider={provider} size={52} /><h3>Connect {providerName(provider)}</h3><p>Add and verify an API key before using this provider.</p><button className="primary-button" onClick={onSettings}>Open provider settings</button></div>;
}

function MethodCard({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return <button className="method-card" onClick={onClick}><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div><ChevronRight size={18} /></button>;
}

function ExistingFlow({ provider, onAdded, setError }: FlowProps) {
  const [voices, setVoices] = useState<RemoteVoice[]>();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string>();
  useEffect(() => { setVoices(undefined); dialogueApi.voices.listRemote(provider).then(setVoices).catch((error) => setError(readError(error))); }, [provider, setError]);
  async function add(voice: RemoteVoice) { setBusy(voice.providerVoiceId); setError(undefined); try { onAdded(await dialogueApi.voices.link({ voice })); } catch (error) { setError(readError(error)); } finally { setBusy(undefined); } }
  const shown = voices?.filter((voice) => `${voice.name} ${voice.description}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="flow"><div className="flow-intro"><h3>Voices in your {providerName(provider)} account</h3><p>Adds a local reference; the provider voice is unchanged.</p></div><input className="search-field full" placeholder="Search provider voices…" value={search} onChange={(e) => setSearch(e.target.value)} />
    {!shown ? <Loading label="Loading provider voices…" /> : <div className="remote-list">{shown.map((voice) => <article key={voice.providerVoiceId}><span className="remote-avatar">{voice.name[0]}</span><div><h4>{voice.name}</h4><p>{voice.description}</p><small>{voice.category}</small></div>{voice.previewUrl && <AudioButton url={voice.previewUrl} />}<button className="secondary-button" disabled={busy === voice.providerVoiceId} onClick={() => void add(voice)}>{busy === voice.providerVoiceId ? "Adding…" : "Add"}</button></article>)}</div>}
  </div>;
}

function CloneFlow({ provider, onAdded, setError }: FlowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>(); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [previewText, setPreviewText] = useState(provider === "minimax" ? "Hello! This is a preview of my new voice." : ""); const [noise, setNoise] = useState(true); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  async function submit() { if (!file || !name.trim() || !consent) return; setBusy(true); setError(undefined); try { const bytes = new Uint8Array(await file.arrayBuffer()); const voice = await dialogueApi.voices.clone({ provider, name: name.trim(), description: description.trim(), audio: { name: file.name, mimeType: file.type || "audio/mpeg", bytes }, removeBackgroundNoise: noise, previewText: provider === "minimax" || provider === "fish" ? previewText : undefined }); onAdded(voice); } catch (error) { setError(readError(error)); } finally { setBusy(false); } }
  return <div className="flow clone-flow"><div className="flow-intro"><h3>Upload a clean recording</h3><p>{provider === "elevenlabs" ? "Use at least one minute of clear, single-speaker audio." : provider === "fish" ? "Use at least 10 seconds of clean, single-speaker audio." : "Use 10 seconds to 5 minutes of MP3, M4A or WAV audio."}</p></div>
    <button className={`dropzone ${file ? "has-file" : ""}`} onClick={() => fileRef.current?.click()}><input ref={fileRef} type="file" accept="audio/mp3,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" hidden onChange={(e) => setFile(e.target.files?.[0])} />{file ? <><FileAudio size={25} /><div><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB · Click to replace</span></div><Check size={19} /></> : <><span><Upload size={22} /></span><div><strong>Choose an audio file</strong><small>MP3, M4A or WAV · maximum 20 MB</small></div></>}</button>
    <div className="form-grid"><label>Voice name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warm Narrator" /></label><label>Description <span>optional</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Where you plan to use it" /></label></div>
    {provider === "minimax" && <label>Preview script <span>charged by MiniMax at TTS rates</span><textarea maxLength={1000} value={previewText} onChange={(e) => setPreviewText(e.target.value)} /></label>}
    {provider === "fish" && <label>Reference transcript <span>recommended for best similarity</span><textarea maxLength={1000} value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Type exactly what is spoken in the reference recording." /></label>}
    <label className="toggle-row"><button type="button" className={noise ? "toggle on" : "toggle"} onClick={() => setNoise(!noise)}><i /></button><span><strong>Clean background noise</strong><small>Reduce steady noise before cloning.</small></span></label>
    <label className="consent-row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I own this voice or have explicit permission from the speaker to clone and use it.</span></label>
    <div className="flow-actions"><button className="primary-button" disabled={!file || !name.trim() || !consent || busy} onClick={() => void submit()}>{busy ? <><LoaderCircle className="spin" size={16} /> Creating voice…</> : <><Mic2 size={16} /> Create voice clone</>}</button></div>
  </div>;
}

function GenerateFlow({ provider, onAdded, setError }: FlowProps) {
  const [prompt, setPrompt] = useState("A warm, articulate narrator in their thirties with a gentle European accent, natural pacing, and an optimistic conversational tone."); const [text, setText] = useState("Welcome back. Today, we're going to turn a simple conversation into a memorable story that is truly worth watching."); const [previews, setPreviews] = useState<DesignPreview[]>(); const [selected, setSelected] = useState<string>(); const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  const previewLimits = provider === "elevenlabs" ? { min: 100, max: 1000 } : { min: 1, max: 500 };
  const previewTextValid = text.trim().length >= previewLimits.min && text.length <= previewLimits.max;
  async function generate() { setBusy(true); setError(undefined); try { const result = await dialogueApi.voices.design({ provider, prompt, previewText: text }); setPreviews(result); setSelected(result[0]?.id); } catch (error) { setError(readError(error)); } finally { setBusy(false); } }
  async function save() { const preview = previews?.find((item) => item.id === selected); if (!preview || !name.trim()) return; setBusy(true); setError(undefined); try { onAdded(await dialogueApi.voices.saveDesign({ provider, preview, name: name.trim(), description: prompt })); } catch (error) { setError(readError(error)); } finally { setBusy(false); } }
  return <div className="flow generate-flow"><div className="flow-intro"><h3>Describe the voice</h3><p>Include age, tone, accent, pace and emotion. Don’t name real people.</p></div><label>Voice description <span>{prompt.length} characters</span><textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label><label>Preview script <span>{provider === "elevenlabs" ? "100–1,000 characters" : "Up to 500 characters"} · {text.length}/{previewLimits.max}</span><textarea rows={3} minLength={previewLimits.min} maxLength={previewLimits.max} value={text} onChange={(e) => setText(e.target.value)} />{!previewTextValid && <small className="field-hint error">{provider === "elevenlabs" ? `Add ${Math.max(0, previewLimits.min - text.trim().length)} more characters for ElevenLabs.` : "Enter some preview text."}</small>}</label>
    {!previews && <div className="flow-actions"><span className="cost-note">Provider usage fees may apply.</span><button className="primary-button" disabled={prompt.length < 20 || !previewTextValid || busy} onClick={() => void generate()}>{busy ? <><LoaderCircle className="spin" size={16} /> Designing…</> : <><Sparkles size={16} /> Generate previews</>}</button></div>}
    {previews && <div className="preview-stage"><div className="preview-heading"><div><h4>Choose a preview</h4><p>{provider === "elevenlabs" ? "Save your favorite; unselected previews are discarded." : "MiniMax generated this temporary voice. Use it for TTS within seven days to retain it."}</p></div><button className="text-button" onClick={() => setPreviews(undefined)}>Start over</button></div><div className="preview-options">{previews.map((preview, index) => <button key={preview.id} className={selected === preview.id ? "selected" : ""} onClick={() => setSelected(preview.id)}><AudioButton url={preview.audioUrl} /><span>Option {index + 1}</span>{selected === preview.id && <Check size={15} />}</button>)}</div><label>Voice name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this voice" /></label><div className="flow-actions"><button className="primary-button" disabled={!selected || !name.trim() || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save to voice library"}</button></div></div>}
  </div>;
}

function Loading({ label }: { label: string }) { return <div className="loading"><LoaderCircle className="spin" size={22} />{label}</div>; }
function AudioButton({ url }: { url: string }) { const [playing, setPlaying] = useState(false); const ref = useRef<HTMLAudioElement | null>(null); function toggle(e: React.MouseEvent) { e.stopPropagation(); if (!ref.current) { ref.current = new Audio(url); ref.current.addEventListener("ended", () => setPlaying(false)); } if (playing) ref.current.pause(); else void ref.current.play(); setPlaying(!playing); } return <button className="audio-button" onClick={toggle}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>; }
interface FlowProps { provider: ProviderId; onAdded: (voice: VoiceRecord) => void; setError: (message?: string) => void; }
function readError(cause: unknown) { return (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': Error: /, ""); }
function providerName(provider: ProviderId) { return provider === "elevenlabs" ? "ElevenLabs" : provider === "minimax" ? "MiniMax" : "Fish Audio"; }
