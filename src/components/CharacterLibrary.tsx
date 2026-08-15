import { ArrowLeft, ImagePlus, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CharacterRecord, VoiceRecord } from "../shared/contracts";
import { dialogueApi } from "../lib/client-api";
import { CharacterImageEditor } from "./CharacterImageEditor";
import { ProviderLogo } from "./ProviderLogo";

export function CharacterLibrary({ voices }: { voices: VoiceRecord[] }) {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterRecord[]>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => dialogueApi.characters.list().then(setCharacters), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const shown = useMemo(() => characters?.filter((character) => `${character.name} ${character.description} ${character.voiceName}`.toLowerCase().includes(search.toLowerCase())), [characters, search]);
  async function removeCharacter(character: CharacterRecord) { if (!window.confirm(`Remove ${character.name} from the character library?`)) return; setError(undefined); try { await dialogueApi.characters.remove(character.id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }

  return <>
    <section className="page-heading"><div><h1>Character Library</h1><p>Create reusable characters, size their poses, and assign a voice.</p></div><button className="primary-button large" onClick={() => router.push("/assets/characters/new")}><Plus size={18} /> Create character</button></section>
    <section className="library-toolbar character-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your characters" /></div><span>{characters?.length ?? 0} characters</span></section>{error && <div className="form-error library-error">{error}</div>}
    {!characters ? <div className="loading"><LoaderCircle className="spin" size={22} />Loading characters…</div> : shown?.length ? <section className="character-grid">
      {shown.map((character) => <CharacterCard key={character.id} character={character} onEdit={() => router.push(`/assets/characters/${encodeURIComponent(character.id)}`)} onRemove={() => void removeCharacter(character)} />)}
      <button className="add-card character-add-card" onClick={() => router.push("/assets/characters/new")}><span><Plus size={22} /></span><strong>Create another character</strong><small>Add images, dimensions and a voice</small></button>
    </section> : <section className="empty-library"><span><Users size={26} /></span><h2>{characters.length ? "No matching characters" : "Create your first character"}</h2><p>{characters.length ? "Try another search." : voices.length ? "Add one or more images, configure their dimensions, and choose the character’s voice." : "Create a voice first—every character needs one before it can be used."}</p><button className="primary-button" disabled={!voices.length} onClick={() => router.push("/assets/characters/new")}><Plus size={16} /> Create character</button></section>}
  </>;
}

function CharacterCard({ character, onEdit, onRemove }: { character: CharacterRecord; onEdit: () => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false); const hero = character.images[0];
  return <article className="character-card"><div className="character-card-top"><span>{character.images.length} {character.images.length === 1 ? "image" : "images"}</span><button className="icon-button small" aria-label="Character menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>{menu && <div className="mini-menu character-menu"><button onClick={() => { setMenu(false); onEdit(); }}><Pencil size={14} /> Edit character</button><button className="danger" onClick={onRemove}><Trash2 size={14} /> Remove character</button></div>}</div>
    <div className="character-hero">{hero && <img src={hero.imageUrl} alt={character.name} />}</div>
    <h3>{character.name}</h3><p>{character.description || "No description"}</p>
    <div className="character-voice"><ProviderLogo provider={character.voiceProvider} size={23} /><div><span>Assigned voice</span><strong>{character.voiceName}</strong></div></div>
    <div className="character-poses">{character.images.slice(0, 4).map((image) => <span key={image.id} title={`${image.label}: ${image.width} × ${image.height}`}><img src={image.imageUrl} alt="" /></span>)}{character.images.length > 4 && <i>+{character.images.length - 4}</i>}</div>
  </article>;
}

interface EditableImage { id: string; file?: File; preview: string; label: string; width: number; height: number; previewXPercent: number; previewYPercent: number; existingId?: string; }

export function CharacterEditor({ voices, characterId }: { voices: VoiceRecord[]; characterId?: string }) {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterRecord>();
  const [loaded, setLoaded] = useState(!characterId);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    void dialogueApi.characters.list().then((characters) => {
      if (cancelled) return;
      const match = characters.find((candidate) => candidate.id === characterId);
      if (match) setCharacter(match);
      else setError("Character not found.");
      setLoaded(true);
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [characterId]);

  if (!loaded) return <section className="empty-library"><LoaderCircle className="spin" size={26} /><h2>Loading character…</h2></section>;
  if (error || characterId && !character) return <section className="empty-library"><span><Users size={26} /></span><h2>Character unavailable</h2><p>{error}</p><button className="primary-button" onClick={() => router.push("/assets/characters")}>Back to characters</button></section>;
  return <CharacterForm key={character?.id ?? "new"} voices={voices} character={character} onClose={() => router.push("/assets/characters")} onSaved={() => router.push("/assets/characters")} />;
}

function CharacterForm({ voices, character, onClose, onSaved }: { voices: VoiceRecord[]; character?: CharacterRecord; onClose: () => void; onSaved: (character: CharacterRecord) => void }) {
  const inputRef = useRef<HTMLInputElement>(null); const urls = useRef<string[]>([]);
  const [name, setName] = useState(character?.name ?? ""); const [description, setDescription] = useState(character?.description ?? ""); const [voiceId, setVoiceId] = useState(character?.voiceId ?? voices[0]?.id ?? "");
  const [images, setImages] = useState<EditableImage[]>(() => character?.images.map((image) => ({
    id: image.id, existingId: image.id, preview: image.imageUrl, label: image.label, width: image.width, height: image.height, previewXPercent: 50, previewYPercent: 50,
  })) ?? []); const [selectedImageId, setSelectedImageId] = useState(character?.images[0]?.id); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);

  async function addFiles(files: FileList | null) {
    if (!files) return; setError(undefined);
    const accepted = [...files].filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, Math.max(0, 20 - images.length));
    if (accepted.length !== files.length) setError("Only JPG, PNG, or WebP images are supported, with a maximum of 20 images per character.");
    const added = await Promise.all(accepted.map(async (file, index) => { const size = await imageDimensions(file); const preview = URL.createObjectURL(file); urls.current.push(preview); return {
      id: crypto.randomUUID(), file, preview, label: file.name.replace(/\.[^.]+$/, "") || `Pose ${images.length + index + 1}`, width: size.width, height: size.height, previewXPercent: 50, previewYPercent: 50,
    }; }));
    setImages((current) => [...current, ...added]); setSelectedImageId((current) => current ?? added[0]?.id); if (inputRef.current) inputRef.current.value = "";
  }
  function update(id: string, patch: Partial<EditableImage>) { setImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image)); }
  function remove(id: string) {
    setImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed?.file) URL.revokeObjectURL(removed.preview);
      const remaining = current.filter((image) => image.id !== id);
      if (selectedImageId === id) setSelectedImageId(remaining[0]?.id);
      return remaining;
    });
  }

  const selectedImage = images.find((image) => image.id === selectedImageId) ?? images[0];
  async function save() {
    if (!name.trim() || !voiceId || !images.length) return; setBusy(true); setError(undefined);
    try {
      const newImages = await Promise.all(images.filter((image): image is EditableImage & { file: File } => Boolean(image.file)).map(async (image) => ({
        name: image.file.name, mimeType: image.file.type, bytes: new Uint8Array(await image.file.arrayBuffer()), label: image.label, width: image.width, height: image.height,
      })));
      onSaved(character ? await dialogueApi.characters.update({ localCharacterId: character.id, name, description, voiceId,
        existingImages: images.filter((image) => image.existingId).map((image) => ({ id: image.existingId!, label: image.label, width: image.width, height: image.height })), newImages,
      }) : await dialogueApi.characters.create({ name, description, voiceId, images: newImages }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }

  return <section className="character-editor-page" aria-label={character ? `Edit ${character.name}` : "Create a character"}>
    <div className="character-editor-shell">
      <aside className="character-editor-controls">
        <header className="character-editor-page-header">
          <button className="back-button" disabled={busy} onClick={onClose}><ArrowLeft size={17} /> Characters</button>
          <div><span className="eyebrow">Character asset</span><h1>{character ? "Edit character" : "Create a character"}</h1><p>Configure the voice and preview each pose.</p></div>
        </header>
        <div className="character-creator-body">
          <div className="character-form-grid"><label>Character name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nora" /></label><label>Assigned voice<select value={voiceId} onChange={(event) => setVoiceId(event.target.value)}><option value="" disabled>Choose a local voice</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.provider}</option>)}</select></label></div>
          <label className="character-description">Description <span>optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Role, personality, or visual notes" rows={3} /></label>
          <div className="character-images-heading"><div><h3>Character images</h3><p>Add up to 20 poses. Transparent PNGs work best.</p></div><button className="secondary-button" onClick={() => inputRef.current?.click()}><ImagePlus size={15} /> Add</button><input ref={inputRef} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void addFiles(event.target.files)} /></div>
          {!images.length ? <button className="character-dropzone" onClick={() => inputRef.current?.click()}><span><Upload size={23} /></span><strong>Choose character images</strong><small>JPG, PNG or WebP · multiple files supported</small></button> : <div className="character-image-list">{images.map((image, index) => <article key={image.id} className={selectedImage?.id === image.id ? "selected" : ""}><button type="button" className="character-image-preview" aria-label={`Edit the size of ${image.label}`} aria-pressed={selectedImage?.id === image.id} onClick={() => setSelectedImageId(image.id)}><img src={image.preview} alt="" /><span>{index + 1}</span></button><label>Image label<input value={image.label} onFocus={() => setSelectedImageId(image.id)} onChange={(event) => update(image.id, { label: event.target.value })} /></label><button type="button" className="character-image-dimensions" aria-label={`Edit ${image.label} size, currently ${image.width} by ${image.height} pixels`} onClick={() => setSelectedImageId(image.id)}><span>Size</span><strong>{image.width} × {image.height}</strong></button><button className="icon-button" aria-label={`Remove ${image.label}`} onClick={() => remove(image.id)}><Trash2 size={16} /></button></article>)}</div>}
          {error && <div className="form-error">{error}</div>}
          <div className="flow-actions character-actions"><span className="cost-note">Saved locally.</span><button className="primary-button" disabled={!name.trim() || !voiceId || !images.length || busy} onClick={() => void save()}>{busy ? <><LoaderCircle className="spin" size={16} /> Saving…</> : character ? <><Pencil size={16} /> Save changes</> : <><Users size={16} /> Create character</>}</button></div>
        </div>
      </aside>
      <main className="character-editor-preview-pane">
        {selectedImage ? <CharacterImageEditor image={selectedImage} disabled={busy} onUpdate={(size) => update(selectedImage.id, size)} /> : <div className="character-editor-empty-preview"><ImagePlus size={28} /><strong>No image selected</strong><p>Add a character image to preview its size and placement.</p></div>}
      </main>
    </div>
  </section>;
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const image = new Image(); image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url); }; image.onerror = () => { reject(new Error(`Could not read ${file.name}.`)); URL.revokeObjectURL(url); }; image.src = url; });
}
