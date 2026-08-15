import { BookOpenText, Clock3, Film, FolderOpen, MessageSquareText, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectRecord } from "../shared/contracts";
import { dialogueApi } from "../lib/client-api";

export function ProjectLibrary({ onOpen, createRequest = 0 }: { onOpen: (project: ProjectRecord) => void; createRequest?: number }) {
  const [projects, setProjects] = useState<ProjectRecord[]>(); const [search, setSearch] = useState(""); const [sort, setSort] = useState<"updated-desc" | "updated-asc" | "created-desc" | "name-asc" | "name-desc">("updated-desc");
  const [editing, setEditing] = useState<ProjectRecord | "new">(); const [error, setError] = useState<string>();
  const refresh = useCallback(() => dialogueApi.projects.list().then(setProjects).catch((cause) => setError(readError(cause))), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (createRequest) setEditing("new"); }, [createRequest]);
  const shown = useMemo(() => (projects ?? []).filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "name-asc" ? a.name.localeCompare(b.name) : sort === "name-desc" ? b.name.localeCompare(a.name) : sort === "created-desc" ? b.createdAt.localeCompare(a.createdAt) : sort === "updated-asc" ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt)), [projects, search, sort]);

  async function remove(project: ProjectRecord) {
    if (!window.confirm(`Remove “${project.name}”? This cannot be undone.`)) return;
    try { await dialogueApi.projects.remove(project.id); setProjects((current) => current?.filter((item) => item.id !== project.id)); }
    catch (cause) { setError(readError(cause)); }
  }

  return <>
    <section className="page-heading"><div><h1>Projects</h1><p>Create character-led dialogue videos.</p></div><button className="primary-button large" onClick={() => setEditing("new")}><Plus size={18} /> New project</button></section>
    <section className="library-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your projects" /></div><label className="project-sort">Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="updated-desc">Recently updated</option><option value="updated-asc">Least recently updated</option><option value="created-desc">Recently created</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option></select></label><span className="project-count">{projects?.length ?? 0} local project{projects?.length === 1 ? "" : "s"}</span></section>
    {error && <div className="form-error">{error}</div>}
    {!projects ? <section className="empty-library"><span><FolderOpen size={26} /></span><h2>Loading projects…</h2></section> : shown.length ? <section className="project-grid">{shown.map((project) => <ProjectCard key={project.id} project={project} onOpen={() => onOpen(project)} onEdit={() => setEditing(project)} onRemove={() => void remove(project)} />)}<button className="add-card project-add-card" onClick={() => setEditing("new")}><span><Plus size={22} /></span><strong>Create another project</strong></button></section> : <section className="empty-library"><span><Film size={26} /></span><h2>{projects.length ? "No matching projects" : "Create your first project"}</h2><p>{projects.length ? "Try a different search." : "Choose a format and start creating."}</p><button className="primary-button" onClick={() => setEditing("new")}><Plus size={16} /> New project</button></section>}
    {editing && <ProjectDialog project={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onSaved={(saved) => { setProjects((current) => [saved, ...(current ?? []).filter((item) => item.id !== saved.id)]); setEditing(undefined); if (editing === "new") onOpen(saved); }} />}
  </>;
}

function ProjectCard({ project, onOpen, onEdit, onRemove }: { project: ProjectRecord; onOpen: () => void; onEdit: () => void; onRemove: () => void }) {
  const lineCount = project.editorState.blocks?.filter((block) => block.kind === "dialogue-line").length ?? 0; const messageCount = project.editorState.blocks?.filter((block) => block.kind === "fake-text-message").length ?? 0; const reddit = project.editorState.projectType === "reddit-story"; const fakeText = project.editorState.projectType === "fake-text";
  const [menu, setMenu] = useState(false); const { width, height, fps } = project.editorState.canvas;
  return <article className={`project-card project-bento-card ${projectTone(project.id)}`} onDoubleClick={onOpen}>
    <div className="project-bento-top"><span className="project-kind">{reddit || fakeText ? <MessageSquareText size={13} /> : <Film size={13} />} {reddit ? "Reddit story" : fakeText ? "Text story" : "Dialogue"}</span><button className="icon-button small" aria-label="Project menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>{menu && <div className="mini-menu project-menu"><button onClick={() => { setMenu(false); onEdit(); }}><Pencil size={14} /> Edit details</button><button className="danger" onClick={onRemove}><Trash2 size={14} /> Remove project</button></div>}</div>
    <div className="project-bento-art" aria-hidden="true">{reddit ? <BookOpenText size={88} strokeWidth={1.4} /> : fakeText ? <MessageSquareText size={88} strokeWidth={1.4} /> : <Film size={88} strokeWidth={1.4} />}<div className="project-format" style={{ aspectRatio: `${width} / ${height}` }}><span className="brand-mark"><i /><i /><i /></span></div></div>
    <div className="project-card-copy"><h3>{project.name}</h3><p>{project.description || "Untitled local production"}</p></div>
    <div className="project-card-meta"><span><Clock3 size={12} /> {relativeDate(project.updatedAt)}</span><span>{ratioLabel(width, height)} · {reddit ? "1 story" : fakeText ? `${messageCount} messages` : `${lineCount} lines`} · {fps} fps</span></div>
    <button className="project-open" onClick={onOpen}>Open project</button>
  </article>;
}

function ProjectDialog({ project, onClose, onSaved }: { project?: ProjectRecord; onClose: () => void; onSaved: (project: ProjectRecord) => void }) {
  const canvas = project?.editorState.canvas; const initialPreset = canvas ? presetFor(canvas.width, canvas.height) : "9:16";
  const [name, setName] = useState(project?.name ?? "Untitled project"); const [description, setDescription] = useState(project?.description ?? "");
  const [preset, setPreset] = useState(initialPreset); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function save() {
    setBusy(true); setError(undefined);
    try {
      if (project) onSaved(await dialogueApi.projects.update({ localProjectId: project.id, name, description }));
      else { const selected = presets.find((item) => item.label === preset)!; onSaved(await dialogueApi.projects.create({ name, description, projectType: "dialogue", width: selected.width, height: selected.height, fps: 30 })); }
    } catch (cause) { setError(readError(cause)); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="modal project-dialog" role="dialog" aria-modal="true" aria-label={project ? "Edit project" : "Create project"}><header className="modal-header"><div><div><h2>{project ? "Edit project" : "Create project"}</h2></div></div><button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={19} /></button></header><div className="modal-body project-dialog-body">
    {!project && <div className="project-type-picker"><strong>Project type</strong><div><button className="active"><Film size={20} /><span><b>Dialogue</b><small>Characters, voices, and conversations</small></span></button></div></div>}
    <label>Project name<input autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Description <span>optional</span><textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you making?" /></label>
    {!project && <div className="project-presets"><strong>Canvas</strong><div>{presets.map((item) => <button key={item.label} className={preset === item.label ? "active" : ""} onClick={() => setPreset(item.label)}><i style={{ aspectRatio: `${item.width} / ${item.height}` }} /><b>{item.label}</b><small>{item.width}×{item.height}</small></button>)}</div></div>}{error && <div className="form-error">{error}</div>}<div className="flow-actions"><button className="text-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : project ? "Save changes" : "Create project"}</button></div>
  </div></section></div>;
}

const presets = [{ label: "9:16", width: 1080, height: 1920 }, { label: "16:9", width: 1920, height: 1080 }, { label: "1:1", width: 1080, height: 1080 }];
function presetFor(width: number, height: number) { return ratioLabel(width, height); }
function ratioLabel(width: number, height: number) { const divisor = gcd(width, height); return `${width / divisor}:${height / divisor}`; }
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function projectTone(value: string) { const tones = ["tone-lavender", "tone-sky", "tone-lemon", "tone-mint", "tone-peach", "tone-rose"]; const hash = [...value].reduce((total, character) => total + character.charCodeAt(0), 0); return tones[hash % tones.length]; }
function relativeDate(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); return days < 1 ? "Updated today" : days === 1 ? "Updated yesterday" : `Updated ${days} days ago`; }
function readError(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
