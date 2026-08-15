"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines, Check, ChevronRight, CircleHelp, Download, Eye, EyeOff, FolderOpen,
  HardDrive, KeyRound, LayoutGrid, LoaderCircle, LockKeyhole, Mic2, Plus, Settings,
  AudioWaveform as Waveform, Users, Video,
} from "lucide-react";
import type {
  ElevenLabsSpeechToTextModel, ProviderId, ProviderStatus,
  SpeechToTextConfiguration, SpeechToTextProviderId,
} from "@/shared/contracts";
import { dialogueApi } from "@/lib/client-api";
import { ProviderLogo } from "./ProviderLogo";
import { CreateDialogueButton } from "./CreateDialogueButton";

type BusyAction = `${ProviderId}:connect` | `${ProviderId}:disconnect` | "whisper:install" | "stt:save";

export function ProviderPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>();
  const [speechToText, setSpeechToText] = useState<SpeechToTextConfiguration>();
  const [selectedStt, setSelectedStt] = useState<SpeechToTextProviderId>("faster-whisper");
  const [sttModel, setSttModel] = useState<ElevenLabsSpeechToTextModel>("scribe_v2");
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [visible, setVisible] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [busy, setBusy] = useState<BusyAction>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    const [voiceProviders, transcription] = await Promise.all([dialogueApi.providers.status(), dialogueApi.providers.speechToText()]);
    setProviders(voiceProviders); setSpeechToText(transcription); setSelectedStt(transcription.selected); setSttModel(transcription.elevenLabsModel);
  }, []);

  useEffect(() => { void refresh().catch((cause) => setError(readError(cause))); }, [refresh]);
  useEffect(() => {
    const whisper = speechToText?.providers.find((provider) => provider.id === "faster-whisper")?.localStatus;
    if (whisper?.state !== "downloading") return;
    const timer = window.setInterval(() => void refresh().catch((cause) => setError(readError(cause))), 1200);
    return () => window.clearInterval(timer);
  }, [providers, refresh, speechToText]);

  const byId = useMemo(() => new Map(providers?.map((provider) => [provider.id, provider])), [providers]);
  const whisper = speechToText?.providers.find((provider) => provider.id === "faster-whisper");
  const elevenStt = speechToText?.providers.find((provider) => provider.id === "elevenlabs");

  async function connect(provider: ProviderId) {
    const apiKey = keys[provider]?.trim(); if (!apiKey) return;
    setBusy(`${provider}:connect`); setError(undefined); setSaved(false);
    try { setProviders(await dialogueApi.providers.configure(provider, apiKey)); setKeys((current) => ({ ...current, [provider]: "" })); setSpeechToText(await dialogueApi.providers.speechToText()); }
    catch (cause) { setError(readError(cause)); } finally { setBusy(undefined); }
  }

  async function disconnect(provider: ProviderId) {
    setBusy(`${provider}:disconnect`); setError(undefined); setSaved(false);
    try { setProviders(await dialogueApi.providers.disconnect(provider)); setSpeechToText(await dialogueApi.providers.speechToText()); }
    catch (cause) { setError(readError(cause)); } finally { setBusy(undefined); }
  }

  async function installWhisper() {
    setBusy("whisper:install"); setError(undefined); setSaved(false);
    try { await dialogueApi.speech.installSubtitles(); setSpeechToText(await dialogueApi.providers.speechToText()); }
    catch (cause) { setError(readError(cause)); } finally { setBusy(undefined); }
  }

  async function saveSpeechToText() {
    setBusy("stt:save"); setError(undefined); setSaved(false);
    try { const result = await dialogueApi.providers.configureSpeechToText(selectedStt, sttModel); setSpeechToText(result); setSaved(true); }
    catch (cause) { setError(readError(cause)); } finally { setBusy(undefined); }
  }

  if (!providers || !speechToText) return <div className="app-loading"><span className="brand-mark" /></div>;

  return <div className="app-shell provider-page-shell">
    <ProviderSidebar />
    <main className="main-content">
      <header className="topbar"><div className="crumbs"><span>Workspace</span><b>/</b><strong>Settings</strong></div></header>
      <div className="page-content provider-page-content">
        <section className="provider-page-heading">
          <div><h1>Settings</h1><p>Connect voice generation and transcription services for Dialogue Lab.</p></div>
        </section>

        <section className="provider-config-section">
          <header className="provider-section-title"><span><AudioLines size={21} /></span><div><h2>Voices &amp; text to speech</h2><p>Connect the cloud providers you want to use for speech generation.</p></div></header>
          <div className="provider-config-grid">
            <CloudProviderCard provider={byId.get("elevenlabs")!} apiKey={keys.elevenlabs || ""} visible={Boolean(visible.elevenlabs)} busy={busy} onKey={(value) => setKeys((current) => ({ ...current, elevenlabs: value }))} onToggle={() => setVisible((current) => ({ ...current, elevenlabs: !current.elevenlabs }))} onConnect={() => void connect("elevenlabs")} onDisconnect={() => void disconnect("elevenlabs")} />
            <CloudProviderCard provider={byId.get("minimax")!} apiKey={keys.minimax || ""} visible={Boolean(visible.minimax)} busy={busy} onKey={(value) => setKeys((current) => ({ ...current, minimax: value }))} onToggle={() => setVisible((current) => ({ ...current, minimax: !current.minimax }))} onConnect={() => void connect("minimax")} onDisconnect={() => void disconnect("minimax")} />
            <CloudProviderCard provider={byId.get("fish")!} apiKey={keys.fish || ""} visible={Boolean(visible.fish)} busy={busy} onKey={(value) => setKeys((current) => ({ ...current, fish: value }))} onToggle={() => setVisible((current) => ({ ...current, fish: !current.fish }))} onConnect={() => void connect("fish")} onDisconnect={() => void disconnect("fish")} />
          </div>
        </section>

        <section className="provider-config-section stt-section">
          <header className="provider-section-title"><span><Waveform size={21} /></span><div><h2>Speech to text</h2><p>Choose the engine used for transcripts and subtitle timing.</p></div></header>
          <div className="stt-choice-grid">
            <button className={`stt-choice ${selectedStt === "faster-whisper" ? "selected" : ""}`} onClick={() => { setSelectedStt("faster-whisper"); setSaved(false); }}>
              <span className="choice-radio"><i /></span><span className="stt-icon whisper"><Mic2 size={22} /></span><span className="stt-copy"><strong>Whisper Fast</strong><small>Local · faster-whisper</small><p>Private, multilingual transcription with no usage fees. Audio never leaves your machine.</p></span>
              <StatusPill configured={Boolean(whisper?.configured)} loading={whisper?.localStatus?.state === "downloading"} />
              <span className="stt-action" onClick={(event) => event.stopPropagation()}>{whisper?.configured ? <span className="local-path"><HardDrive size={13} /> {whisper.localStatus?.model} model</span> : <button className="secondary-button" disabled={busy === "whisper:install" || whisper?.localStatus?.state === "downloading"} onClick={() => void installWhisper()}>{whisper?.localStatus?.state === "downloading" ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />} {whisper?.localStatus?.state === "error" ? "Retry install" : "Install locally"}</button>}</span>
            </button>
            <button className={`stt-choice ${selectedStt === "elevenlabs" ? "selected" : ""}`} onClick={() => { setSelectedStt("elevenlabs"); setSaved(false); }}>
              <span className="choice-radio"><i /></span><ProviderLogo provider="elevenlabs" size={46} /><span className="stt-copy"><strong>ElevenLabs Scribe</strong><small>Cloud · precise word timestamps</small><p>High-accuracy transcription with language detection and detailed timing.</p></span>
              <StatusPill configured={Boolean(elevenStt?.configured)} />
              <span className="stt-action" onClick={(event) => event.stopPropagation()}>{elevenStt?.configured ? <label className="model-select-label">Model<select value={sttModel} onChange={(event) => { setSttModel(event.target.value as ElevenLabsSpeechToTextModel); setSaved(false); }}><option value="scribe_v2">Scribe v2</option><option value="scribe_v1">Scribe v1</option></select></label> : <span className="connect-note"><KeyRound size={13} /> Connect ElevenLabs above</span>}</span>
            </button>
          </div>
          <footer className="stt-footer"><span><LockKeyhole size={15} /> {selectedStt === "faster-whisper" ? "Selected audio stays local." : "Audio is sent to ElevenLabs only for transcription."}</span><div>{saved && <span className="saved-note"><Check size={14} /> Saved</span>}<button className="primary-button" disabled={busy === "stt:save" || (selectedStt === "elevenlabs" && !elevenStt?.configured)} onClick={() => void saveSpeechToText()}>{busy === "stt:save" ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save speech-to-text provider</button></div></footer>
        </section>
        {error && <div className="form-error provider-page-error">{error}</div>}
      </div>
    </main>
  </div>;
}

function CloudProviderCard({ provider, apiKey, visible, busy, onKey, onToggle, onConnect, onDisconnect }: { provider: ProviderStatus; apiKey: string; visible: boolean; busy?: BusyAction; onKey: (value: string) => void; onToggle: () => void; onConnect: () => void; onDisconnect: () => void }) {
  const connecting = busy === `${provider.id}:connect`; const disconnecting = busy === `${provider.id}:disconnect`;
  return <article className={`provider-config-card ${provider.configured ? "connected" : ""}`}>
    <div className="provider-card-top"><ProviderLogo provider={provider.id} size={43} /><div><h3>{provider.name}</h3><p>{provider.description}</p></div><StatusPill configured={provider.configured} /></div>
    {provider.configured ? <div className="provider-connected-row"><span><LockKeyhole size={14} /> Key stored {provider.keyHint}</span><button className="text-button danger" disabled={disconnecting} onClick={onDisconnect}>{disconnecting ? "Disconnecting…" : "Disconnect"}</button></div> : <div className="provider-key-row"><div className="provider-key-field"><KeyRound size={15} /><input aria-label={`${provider.name} API key`} type={visible ? "text" : "password"} value={apiKey} onChange={(event) => onKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onConnect(); }} placeholder={`Paste ${provider.name} API key`} /><button aria-label={visible ? "Hide API key" : "Show API key"} onClick={onToggle}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><button className="secondary-button" disabled={!apiKey.trim() || connecting} onClick={onConnect}>{connecting ? <LoaderCircle className="spin" size={14} /> : <ChevronRight size={14} />} Connect</button></div>}
    <a href={provider.docsUrl} target="_blank" rel="noreferrer">Get an API key <ChevronRight size={12} /></a>
  </article>;
}

function StatusPill({ configured, loading = false }: { configured: boolean; loading?: boolean }) {
  return <span className={`provider-status-pill ${configured ? "ready" : loading ? "loading" : "idle"}`}>{loading ? <LoaderCircle className="spin" size={11} /> : configured ? <Check size={11} /> : <i />}{loading ? "Installing" : configured ? "Ready" : "Not configured"}</span>;
}

function ProviderSidebar() {
  return <aside className="sidebar"><div className="sidebar-brand"><span className="brand-mark" /><span>Dialogue Lab</span></div><Link className="new-video" href="/projects?new=1"><Plus size={17} /> New project</Link><nav><span className="nav-label">Workspace</span><Link href="/projects"><LayoutGrid size={17} /> Home</Link><Link href="/projects"><FolderOpen size={17} /> Projects</Link><span className="nav-label">Create</span><CreateDialogueButton /><span className="nav-label">Assets</span><Link href="/assets/voices"><AudioLines size={17} /> Voices</Link><Link href="/assets/characters"><Users size={17} /> Characters</Link><Link href="/assets/backgrounds"><Video size={17} /> Backgrounds</Link></nav><div className="sidebar-bottom"><Link className="active" href="/settings"><Settings size={17} /> Settings</Link><Link href="/docs"><CircleHelp size={17} /> Help &amp; guides</Link></div></aside>;
}

function readError(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
