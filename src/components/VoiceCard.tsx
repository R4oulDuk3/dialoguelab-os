import { AudioLines, ImagePlus, LoaderCircle, MoreHorizontal, Pause, Pencil, Play, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VoiceRecord } from "../shared/contracts";
import { ModalPortal } from "./ModalPortal";
import { ProviderLogo } from "./ProviderLogo";
import { SpeechDialog } from "./SpeechDialog";

const colors = ["#f2e8ff", "#e5f4ff", "#ffe9ee", "#e6f7ef", "#fff0db", "#eae8ff"];

interface Props {
  voice: VoiceRecord;
  onRemove: () => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onSetImage: (file: File) => Promise<void>;
}

export function VoiceCard({ voice, onRemove, onRename, onSetImage }: Props) {
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [generatingSpeech, setGeneratingSpeech] = useState(false);
  const [name, setName] = useState(voice.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const audio = useRef<HTMLAudioElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const color = colors[hash(voice.name) % colors.length];

  function toggle() {
    if (!voice.previewUrl) return;
    if (!audio.current) {
      audio.current = new Audio(voice.previewUrl);
      audio.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) audio.current.pause(); else void audio.current.play();
    setPlaying(!playing);
  }

  async function rename() {
    if (!name.trim() || name.trim() === voice.name) { setEditingName(false); return; }
    setBusy(true); setError(undefined);
    try { await onRename(name.trim()); setEditingName(false); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    setMenu(false); setBusy(true); setError(undefined);
    try { await onSetImage(file); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); if (imageInput.current) imageInput.current.value = ""; }
  }

  async function remove() {
    if (!window.confirm(`Remove ${voice.name} from the voice library?`)) return;
    setMenu(false); setBusy(true); setError(undefined);
    try { await onRemove(); } catch (cause) { setError(readError(cause)); setBusy(false); }
  }

  return (
    <article className="voice-card">
      <div className="voice-card-top">
        <span className={`kind-badge ${voice.kind}`}>{voice.kind}</span>
        <button className="icon-button small" disabled={busy} onClick={() => setMenu(!menu)} aria-label="Voice menu">{busy ? <LoaderCircle className="spin" size={15} /> : <MoreHorizontal size={17} />}</button>
        <input ref={imageInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} />
        {menu && <div className="mini-menu">
          <button onClick={() => { setGeneratingSpeech(true); setMenu(false); }}><AudioLines size={14} /> Generate speech</button>
          <button onClick={() => { setName(voice.name); setEditingName(true); setMenu(false); }}><Pencil size={14} /> Edit name</button>
          <button onClick={() => imageInput.current?.click()}><ImagePlus size={14} /> {voice.imageUrl ? "Change image" : "Add image"}</button>
          <button className="danger" onClick={() => void remove()}>Remove from library</button>
        </div>}
      </div>
      <button className={`voice-avatar ${voice.previewUrl ? "playable" : ""}`} style={{ background: color }} onClick={toggle} aria-label={voice.previewUrl ? `Play ${voice.name}` : `${voice.name} has no preview`}>
        {voice.imageUrl ? <img src={voice.imageUrl} alt="" /> : <span>{initials(voice.name)}</span>}
        {voice.previewUrl && <i className="play-overlay">{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</i>}
      </button>
      <h3>{voice.name}</h3>
      <p>{voice.description || "No description"}</p>
      <div className="voice-meta"><ProviderLogo provider={voice.provider} size={22} /><span>{providerName(voice.provider)}</span><i>·</i><span>{voice.providerCategory || voice.kind}</span></div>
      {voice.requiresActivation && <div className="activation-note" title="MiniMax requires first TTS use within seven days"><TriangleAlert size={13} /> Activate within 7 days</div>}
      {error && <div className="card-error">{error}</div>}
      {editingName && <ModalPortal><div className="modal-backdrop voice-edit-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditingName(false); }}>
        <form className="voice-edit-dialog" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
          <header><div><h2>Edit voice name</h2></div><button type="button" className="icon-button" onClick={() => setEditingName(false)}><X size={18} /></button></header>
          <label>Voice name<input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          {error && <div className="form-error">{error}</div>}
          <footer><button type="button" className="secondary-button" onClick={() => setEditingName(false)}>Cancel</button><button className="primary-button" disabled={!name.trim() || busy}>{busy ? "Saving…" : "Save name"}</button></footer>
        </form>
      </div></ModalPortal>}
      {generatingSpeech && <ModalPortal><SpeechDialog voice={voice} onClose={() => setGeneratingSpeech(false)} /></ModalPortal>}
    </article>
  );
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function hash(value: string) { return [...value].reduce((total, character) => total + character.charCodeAt(0), 0); }
function readError(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
function providerName(provider: VoiceRecord["provider"]) { return provider === "elevenlabs" ? "ElevenLabs" : provider === "minimax" ? "MiniMax" : "Fish Audio"; }
