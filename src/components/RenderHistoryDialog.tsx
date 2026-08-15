"use client";

import { Ban, Check, Download, Film, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ProjectRenderJobRecord, RenderQuality } from "@/shared/contracts";

export function RenderHistoryDialog({ jobs, busy, error, onClose, onStart, onCancel, onRetry, onRemove }: {
  jobs: ProjectRenderJobRecord[]; busy: boolean; error?: string; onClose: () => void; onStart: (quality: RenderQuality) => Promise<void>;
  onCancel: (id: string) => Promise<void>; onRetry: (id: string) => Promise<void>; onRemove: (id: string) => Promise<void>;
}) {
  const [quality, setQuality] = useState<RenderQuality>("standard"); const active = jobs.some((job) => ["queued", "preparing", "rendering"].includes(job.status));
  return <div className="modal-backdrop render-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="modal render-history-dialog" role="dialog" aria-modal="true" aria-label="Local renders">
    <header className="modal-header"><div><div><h2>Renders</h2><p>Saved on this computer.</p></div></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></header>
    <div className="render-create-row"><label>Quality<select value={quality} onChange={(event) => setQuality(event.target.value as RenderQuality)}><option value="draft">Draft</option><option value="standard">Standard</option><option value="high">High</option></select></label><button className="primary-button" disabled={busy || active} onClick={() => void onStart(quality)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Film size={15} />} {active ? "Render in progress" : "Start local render"}</button></div>
    {error && <div className="form-error render-history-error">{error}</div>}
    <div className="render-history-list">{jobs.length ? jobs.map((job) => <article key={job.id} className={`render-job ${job.status}`}>
      <div className="render-job-icon">{job.status === "complete" ? <Check size={16} /> : ["failed","cancelled"].includes(job.status) ? <Ban size={16} /> : <LoaderCircle className={job.status === "queued" ? "" : "spin"} size={16} />}</div>
      <div className="render-job-copy"><strong>{job.fileName}</strong><span>{job.stage} · {job.quality} · revision {job.projectRevision}</span>{["queued","preparing","rendering"].includes(job.status) && <div className="render-job-progress"><i style={{ width: `${Math.max(2, job.progress)}%` }} /></div>}{job.error && <small>{job.error}</small>}</div>
      <div className="render-job-actions">{job.status === "complete" && job.videoUrl && <><a href={job.videoUrl} target="_blank" rel="noreferrer"><Film size={13} /> Play</a><a href={job.videoUrl} download={job.fileName}><Download size={13} /> Download MP4</a></>}{["queued","preparing","rendering"].includes(job.status) && <button onClick={() => void onCancel(job.id)}><Ban size={13} /> Cancel</button>}{["failed","cancelled"].includes(job.status) && <button onClick={() => void onRetry(job.id)}><RefreshCw size={13} /> Retry</button>}{["complete","failed","cancelled"].includes(job.status) && <button className="danger" onClick={() => { if (window.confirm(`Remove ${job.fileName} from local render history?`)) void onRemove(job.id); }}><Trash2 size={13} /></button>}</div>
    </article>) : <div className="render-history-empty"><Film size={24} /><strong>No renders yet</strong><span>Start a render to create an MP4.</span></div>}</div>
  </section></div>;
}
