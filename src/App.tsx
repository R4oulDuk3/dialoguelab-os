"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioLines, CircleHelp, Film, FolderOpen, LayoutGrid, Mic2, Plus, Search, Settings, Users, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectRecord, ProviderId, ProviderStatus, VoiceRecord } from "./shared/contracts";
import { ProviderSetup } from "./components/ProviderSetup";
import { VoiceCard } from "./components/VoiceCard";
import { AddVoiceDialog } from "./components/AddVoiceDialog";
import { CharacterEditor, CharacterLibrary } from "./components/CharacterLibrary";
import { BackgroundLibrary } from "./components/BackgroundLibrary";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { CreateDialogueButton } from "./components/CreateDialogueButton";
import { dialogueApi } from "./lib/client-api";

type Section = "projects" | "project" | "voices" | "characters" | "backgrounds";

export function App({ initialSection = "projects", projectId, createProject = false, characterId, createCharacter = false }: { initialSection?: Section; projectId?: string; createProject?: boolean; characterId?: string; createCharacter?: boolean }) {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderStatus[]>();
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  const [onboarded, setOnboarded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ProviderId>("all");
  const [activeProject, setActiveProject] = useState<ProjectRecord>();
  const [projectError, setProjectError] = useState<string>();
  const [newProjectRequest, setNewProjectRequest] = useState(0);
  const section = initialSection;
  const characterEditorOpen = section === "characters" && (createCharacter || Boolean(characterId));

  const refresh = useCallback(async () => {
    const [status, library] = await Promise.all([dialogueApi.providers.status(), dialogueApi.voices.list()]);
    setProviders(status); setVoices(library);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (section !== "project" || !projectId) { setActiveProject(undefined); setProjectError(undefined); return; }
    let cancelled = false;
    setActiveProject(undefined); setProjectError(undefined);
    void dialogueApi.projects.get(projectId).then((project) => { if (!cancelled) setActiveProject(project); }).catch((cause) => { if (!cancelled) setProjectError(readError(cause)); });
    return () => { cancelled = true; };
  }, [projectId, section]);
  useEffect(() => { if (createProject) setNewProjectRequest((value) => value + 1); }, [createProject]);

  const visibleVoices = useMemo(() => voices.filter((voice) => {
    const matchesProvider = filter === "all" || voice.provider === filter;
    const matchesSearch = `${voice.name} ${voice.description}`.toLowerCase().includes(search.toLowerCase());
    return matchesProvider && matchesSearch;
  }), [voices, filter, search]);

  if (!providers) return <div className="app-loading"><span className="brand-mark"><i /><i /><i /></span></div>;
  if (!onboarded && !providers.some((provider) => provider.configured)) return <ProviderSetup providers={providers} onboarding onChanged={setProviders} onDone={() => { setOnboarded(true); router.push("/assets/voices"); }} />;

  const openNewProject = () => {
    if (section === "projects") setNewProjectRequest((value) => value + 1);
    else router.push("/projects?new=1");
  };
  const crumbRoot = section === "projects" || section === "project" ? "Workspace" : "Assets";
  const crumbPage = section === "project" ? activeProject?.name || "Project" : section === "projects" ? "Projects" : section === "voices" ? "Voices" : section === "characters" ? characterEditorOpen ? characterId ? "Edit character" : "New character" : "Characters" : "Backgrounds";

  return <div className="app-shell">
    <Sidebar section={section} onNewProject={openNewProject} onSettings={() => router.push("/settings")} />
    <main className={section === "project" ? "main-content project-editor-main" : characterEditorOpen ? "main-content character-editor-main" : "main-content"}>
      {section !== "project" && !characterEditorOpen && <header className="topbar"><div className="crumbs"><span>{crumbRoot}</span><b>/</b><strong>{crumbPage}</strong></div></header>}
      <div className={section === "project" ? "page-content project-page-content" : characterEditorOpen ? "page-content character-editor-page-content" : section === "projects" ? "page-content projects-page-content" : "page-content"}>
        {section === "projects" ? <ProjectLibrary createRequest={newProjectRequest} onOpen={(project) => router.push(`/projects/${encodeURIComponent(project.id)}`)} />
        : section === "project" ? activeProject ? <ProjectWorkspace project={activeProject} onBack={() => router.push("/projects")} onChanged={setActiveProject} />
          : projectError ? <section className="empty-library"><span><Film size={26} /></span><h2>Project unavailable</h2><p>{projectError}</p><button className="primary-button" onClick={() => router.push("/projects")}>Back to projects</button></section>
          : <section className="empty-library"><span><Film size={26} /></span><h2>Loading project…</h2></section>
        : section === "voices" ? <>
          <section className="page-heading"><div><h1>Voice Library</h1><p>Add provider voices, clone a recording, or design a new voice.</p></div><button className="primary-button large" onClick={() => setAdding(true)}><Plus size={18} /> Add voice</button></section>
          <section className="provider-summary">{providers.map((provider) => <button key={provider.id} onClick={() => provider.configured ? setFilter(provider.id) : router.push("/settings")} className={filter === provider.id ? "active" : ""}><span className={`status-dot ${provider.configured ? "online" : ""}`} /> <strong>{provider.name}</strong><span>{provider.configured ? provider.keyHint : "Not connected"}</span></button>)}<button className="manage-link" onClick={() => router.push("/settings")}><Settings size={15} /> Provider settings</button></section>
          <section className="library-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your voices" /></div><div className="filter-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{voices.length}</span></button>{providers.map((provider) => <button key={provider.id} className={filter === provider.id ? "active" : ""} onClick={() => setFilter(provider.id)}>{provider.name}</button>)}</div></section>
          {visibleVoices.length ? <section className="voice-grid">{visibleVoices.map((voice) => <VoiceCard key={voice.id} voice={voice} onRename={async (name) => replaceVoice(await dialogueApi.voices.update({ localVoiceId: voice.id, name }))} onSetImage={async (file) => replaceVoice(await dialogueApi.voices.update({ localVoiceId: voice.id, image: await imageUpload(file) }))} onRemove={async () => { await dialogueApi.voices.remove(voice.id); await refresh(); }} />)}<button className="add-card" onClick={() => setAdding(true)}><span><Plus size={22} /></span><strong>Add another voice</strong><small>Existing, clone or design</small></button></section> : <section className="empty-library"><span><Mic2 size={26} /></span><h2>{voices.length ? "No matching voices" : "Build your voice library"}</h2><p>{voices.length ? "Try a different search or provider filter." : "Connect a provider, add an existing voice, or make a new one."}</p><button className="primary-button" onClick={() => setAdding(true)}><Plus size={16} /> Add your first voice</button></section>}
        </> : section === "characters" ? characterEditorOpen ? <CharacterEditor voices={voices} characterId={characterId} /> : <CharacterLibrary voices={voices} /> : <BackgroundLibrary />}
      </div>
    </main>
    {adding && <AddVoiceDialog providers={providers} onClose={() => setAdding(false)} onAdded={(voice) => { setVoices((current) => [voice, ...current.filter((item) => item.id !== voice.id)]); setAdding(false); }} onSettings={() => { setAdding(false); router.push("/settings"); }} />}
  </div>;

  function replaceVoice(updated: VoiceRecord) { setVoices((current) => current.map((voice) => voice.id === updated.id ? updated : voice)); }
}

async function imageUpload(file: File) { return { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }; }

function Sidebar({ section, onNewProject, onSettings }: { section: Section; onNewProject: () => void; onSettings: () => void }) {
  const projectsActive = section === "projects" || section === "project";
  return <aside className="sidebar"><div className="sidebar-brand"><span className="brand-mark"><i /><i /><i /></span><span>Dialogue Lab</span></div><button className="new-video" onClick={onNewProject}><Plus size={17} /> New project</button><nav><span className="nav-label">Workspace</span><Link href="/projects"><LayoutGrid size={17} /> Home</Link><Link href="/projects" className={projectsActive ? "active" : ""}><FolderOpen size={17} /> Projects</Link><span className="nav-label">Create</span><CreateDialogueButton /><span className="nav-label">Assets</span><Link href="/assets/voices" className={section === "voices" ? "active" : ""}><AudioLines size={17} /> Voices</Link><Link href="/assets/characters" className={section === "characters" ? "active" : ""}><Users size={17} /> Characters</Link><Link href="/assets/backgrounds" className={section === "backgrounds" ? "active" : ""}><Video size={17} /> Backgrounds</Link></nav><div className="sidebar-bottom"><button onClick={onSettings}><Settings size={17} /> Settings</button><Link href="/docs"><CircleHelp size={17} /> Help &amp; guides</Link></div></aside>;
}

function readError(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
