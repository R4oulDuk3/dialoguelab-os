import { Clock3, Film, HardDrive, LoaderCircle, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundRecord } from "../shared/contracts";
import { dialogueApi } from "../lib/client-api";

export function BackgroundLibrary() {
  const [backgrounds, setBackgrounds] = useState<BackgroundRecord[]>(); const [search, setSearch] = useState(""); const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<BackgroundRecord>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => dialogueApi.backgrounds.list().then(setBackgrounds), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const shown = useMemo(() => backgrounds?.filter((background) => `${background.name} ${background.description} ${background.fileName}`.toLowerCase().includes(search.toLowerCase())), [backgrounds, search]);
  async function removeBackground(background: BackgroundRecord) { if (!window.confirm(`Remove ${background.name} from the background library?`)) return; setError(undefined); try { await dialogueApi.backgrounds.remove(background.id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  return <>
    <section className="page-heading"><div><h1>Background Library</h1><p>Add reusable video backgrounds stored on this computer.</p></div><button className="primary-button large" onClick={() => setAdding(true)}><Plus size={18} /> Add background</button></section>
    <section className="library-toolbar background-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your backgrounds" /></div><span>{backgrounds?.length ?? 0} videos</span></section>{error && <div className="form-error library-error">{error}</div>}
    {!backgrounds ? <div className="loading"><LoaderCircle className="spin" size={22} />Loading backgrounds…</div> : shown?.length ? <section className="background-grid">
      {shown.map((background) => <BackgroundCard key={background.id} background={background} onEdit={() => setEditing(background)} onRemove={() => void removeBackground(background)} />)}
      <button className="add-card background-add-card" onClick={() => setAdding(true)}><span><Plus size={22} /></span><strong>Add another background</strong><small>MP4, WebM or MOV</small></button>
    </section> : <section className="empty-library"><span><Film size={26} /></span><h2>{backgrounds.length ? "No matching backgrounds" : "Add your first video background"}</h2><p>{backgrounds.length ? "Try another search." : "Choose a local video to make it available to dialogue scenes and AI editing."}</p><button className="primary-button" onClick={() => setAdding(true)}><Upload size={16} /> Choose video</button></section>}
    {adding && <BackgroundDialog onClose={() => setAdding(false)} onSaved={(background) => { setBackgrounds((current) => [background, ...(current ?? [])]); setAdding(false); }} />}
    {editing && <EditBackgroundDialog background={editing} onClose={() => setEditing(undefined)} onSaved={(updated) => { setBackgrounds((current) => current?.map((item) => item.id === updated.id ? updated : item)); setEditing(undefined); }} />}
  </>;
}

function BackgroundCard({ background, onEdit, onRemove }: { background: BackgroundRecord; onEdit: () => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false); const video = useRef<HTMLVideoElement>(null);
  return <article className="background-card" onMouseEnter={() => void video.current?.play().catch(() => undefined)} onMouseLeave={() => { if (video.current) { video.current.pause(); video.current.currentTime = 0; } }}>
    <div className="background-preview"><video ref={video} src={background.videoUrl} poster={background.thumbnailUrl} muted loop playsInline preload="none" /><span className="background-play"><Play size={18} fill="currentColor" /></span><span className="duration-pill">{formatDuration(background.durationSeconds)}</span></div>
    <div className="background-card-copy"><div><h3>{background.name}</h3><p>{background.description || background.fileName}</p></div><button className="icon-button small" aria-label="Background menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>{menu && <div className="mini-menu background-menu"><button onClick={onEdit}><Pencil size={14} /> Edit details</button><button className="danger" onClick={onRemove}><Trash2 size={14} /> Remove background</button></div>}</div>
    <div className="background-meta"><span>{background.width} × {background.height}</span><i>·</i><span>{formatBytes(background.sizeBytes)}</span><i>·</i><span>{background.mimeType.replace("video/", "").toUpperCase()}</span></div>
  </article>;
}

function EditBackgroundDialog({ background, onClose, onSaved }: { background: BackgroundRecord; onClose: () => void; onSaved: (background: BackgroundRecord) => void }) {
  const [name, setName] = useState(background.name); const [description, setDescription] = useState(background.description); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function save() { if (!name.trim()) return; setBusy(true); setError(undefined); try { onSaved(await dialogueApi.backgrounds.update({ localBackgroundId: background.id, name, description })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="modal background-dialog edit-background-dialog" role="dialog" aria-modal="true" aria-label="Edit background"><header className="modal-header"><div><div><h2>Edit background</h2></div></div><button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={19} /></button></header><div className="modal-body background-dialog-body">
    <div className="background-selected"><img src={background.thumbnailUrl} alt="" /><div><strong>{background.fileName}</strong><span>{formatBytes(background.sizeBytes)} · {background.width} × {background.height} · {formatDuration(background.durationSeconds)}</span></div></div>
    <div className="background-fields"><label>Background name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label><label>Description <span>optional</span><textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} rows={2} /></label></div>
    {error && <div className="form-error">{error}</div>}<div className="flow-actions background-actions"><span className="cost-note"><HardDrive size={13} /> Saved only in the local library.</span><button className="primary-button" disabled={!name.trim() || busy} onClick={() => void save()}>{busy ? <><LoaderCircle className="spin" size={16} /> Saving…</> : "Save changes"}</button></div>
  </div></section></div>;
}

function BackgroundDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (background: BackgroundRecord) => void }) {
  const input = useRef<HTMLInputElement>(null); const [file, setFile] = useState<File>(); const [preview, setPreview] = useState<string>();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [width, setWidth] = useState(0); const [height, setHeight] = useState(0); const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function choose(selected?: File) {
    if (!selected) return; setError(undefined);
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(selected.type)) return setError("Choose an MP4, WebM, or MOV video.");
    if (selected.size > 500 * 1024 * 1024) return setError("Background videos must be 500 MB or smaller.");
    try { const metadata = await videoMetadata(selected); if (preview) URL.revokeObjectURL(preview); const url = URL.createObjectURL(selected);
      setFile(selected); setPreview(url); setName(selected.name.replace(/\.[^.]+$/, "")); setWidth(metadata.width); setHeight(metadata.height); setDuration(metadata.duration);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function save() {
    if (!file || !name.trim() || !width || !height || !duration) return; setBusy(true); setError(undefined);
    try { onSaved(await dialogueApi.backgrounds.create({ name, description, width, height, durationSeconds: duration,
      video: { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="modal background-dialog" role="dialog" aria-modal="true" aria-label="Add a video background"><header className="modal-header"><div><div><h2>Add a video background</h2></div></div><button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={19} /></button></header><div className="modal-body background-dialog-body">
    {!file ? <button className="background-dropzone" onClick={() => input.current?.click()}><span><Upload size={25} /></span><strong>Choose a local video</strong><small>MP4, WebM or MOV · up to 500 MB</small></button> : <div className="background-selected"><video src={preview} controls muted playsInline /><div><strong>{file.name}</strong><span>{formatBytes(file.size)} · {width} × {height} · {formatDuration(duration)}</span><button className="text-button" onClick={() => input.current?.click()}>Choose a different video</button></div></div>}
    <input ref={input} hidden type="file" accept="video/mp4,video/webm,video/quicktime,.mov" onChange={(event) => void choose(event.target.files?.[0])} />
    <div className="background-fields"><label>Background name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="e.g. Downtown at night" /></label><label>Description <span>optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Scene, mood, or usage notes" /></label></div>
    <div className="background-readout"><Clock3 size={15} /><span>Detected automatically</span><strong>{file ? `${width} × ${height} · ${formatDuration(duration)}` : "Choose a video first"}</strong></div>
    {error && <div className="form-error">{error}</div>}
    <div className="flow-actions background-actions"><span className="cost-note"><HardDrive size={13} /> A managed copy will be stored locally.</span><button className="primary-button" disabled={!file || !name.trim() || !width || !height || !duration || busy} onClick={() => void save()}>{busy ? <><LoaderCircle className="spin" size={16} /> Copying…</> : <><Plus size={16} /> Add to library</>}</button></div>
  </div></section></div>;
}

function videoMetadata(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const video = document.createElement("video"); video.preload = "metadata";
    video.onloadedmetadata = () => { const value = { width: video.videoWidth, height: video.videoHeight, duration: video.duration }; URL.revokeObjectURL(url);
      if (!value.width || !value.height || !Number.isFinite(value.duration)) reject(new Error(`Could not read video metadata from ${file.name}.`)); else resolve(value); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`This browser could not read ${file.name}. Try MP4 (H.264) or WebM.`)); }; video.src = url; });
}
function formatDuration(seconds: number) { const rounded = Math.round(seconds); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`; }
function formatBytes(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`; }
