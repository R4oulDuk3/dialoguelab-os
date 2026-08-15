"use client";

import { Check, LoaderCircle, Mic2, RotateCcw, Square, TriangleAlert, X } from "lucide-react";

export type AudioGenerationStatus = "queued" | "generating" | "success" | "error" | "stopped";

export interface AudioGenerationTask {
  lineId: string;
  lineNumber: number;
  characterName: string;
  text: string;
  status: AudioGenerationStatus;
  error?: string;
}

export function AudioGenerationProgressDialog({ tasks, running, onStop, onRetryFailed, onClose }: {
  tasks: AudioGenerationTask[];
  running: boolean;
  onStop: () => void;
  onRetryFailed: () => void;
  onClose: () => void;
}) {
  const complete = tasks.filter((task) => task.status === "success" || task.status === "error" || task.status === "stopped").length;
  const failed = tasks.filter((task) => task.status === "error").length;
  const percentage = tasks.length ? Math.round(complete / tasks.length * 100) : 0;
  return <div className="audio-progress-backdrop" role="presentation"><section className="audio-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="audio-progress-title">
    <header><span><Mic2 size={18} /></span><div><h3 id="audio-progress-title">Generating dialogue audio</h3><p>{running ? `Line ${Math.min(complete + 1, tasks.length)} of ${tasks.length}` : failed ? `Finished with ${failed} failed line${failed === 1 ? "" : "s"}` : "Every selected line is ready"}</p></div><button aria-label="Close" disabled={running} onClick={onClose}><X size={17} /></button></header>
    <div className="audio-progress-meter"><i style={{ width: `${percentage}%` }} /></div>
    <div className="audio-progress-list">{tasks.map((task) => <article key={task.lineId} className={task.status}>
      <span className="audio-task-state">{task.status === "generating" ? <LoaderCircle className="spin" size={15} /> : task.status === "success" ? <Check size={15} /> : task.status === "error" ? <TriangleAlert size={15} /> : task.status === "stopped" ? <Square size={13} /> : <i />}</span>
      <div><strong>Line {task.lineNumber} · {task.characterName}</strong><p>{task.text}</p>{task.error && <small>{task.error}</small>}</div>
    </article>)}</div>
    <footer><span>{complete}/{tasks.length} processed</span>{running ? <button className="secondary-button" onClick={onStop}><Square size={13} /> Stop after current line</button> : <div>{failed > 0 && <button className="secondary-button" onClick={onRetryFailed}><RotateCcw size={13} /> Retry failed</button>}<button className="primary-button" onClick={onClose}>Done</button></div>}</footer>
  </section></div>;
}
