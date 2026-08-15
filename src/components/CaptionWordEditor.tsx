"use client";

import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { SpeechWord } from "@/shared/contracts";

export function CaptionWordEditor({ words, durationSeconds, customized, onSave, onReset, onClose }: {
  words: SpeechWord[]; durationSeconds: number; customized: boolean; onSave: (words: SpeechWord[]) => Promise<void>; onReset: () => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => words.map((word) => ({ ...word }))); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const validation = useMemo(() => validate(draft, durationSeconds), [draft, durationSeconds]);
  const update = (index: number, patch: Partial<SpeechWord>) => setDraft((current) => current.map((word, at) => at === index ? { ...word, ...patch } : word));
  async function save() { if (validation) return; setBusy(true); try { await onSave(draft); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  async function reset() { setBusy(true); try { await onReset(); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="modal caption-word-dialog" role="dialog" aria-modal="true" aria-label="Correct word-level captions">
    <header className="modal-header"><div><h2>Correct transcript and timing</h2><p>Changes apply to this line only.</p></div><button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="caption-word-table"><div className="caption-word-head"><span>Token</span><span>Type</span><span>Start</span><span>End</span><span /></div>{draft.map((word, index) => <div className="caption-word-row" key={index}>
      <input aria-label={`Token ${index + 1}`} value={word.text} onChange={(event) => update(index, { text: event.target.value })} />
      <select value={word.type} onChange={(event) => update(index, { type: event.target.value as SpeechWord["type"] })}><option value="word">Word</option><option value="punctuation">Punctuation</option><option value="spacing">Spacing</option></select>
      <input type="number" min={0} max={durationSeconds} step={.01} value={word.startSeconds} onChange={(event) => update(index, { startSeconds: Number(event.target.value) })} />
      <input type="number" min={0} max={durationSeconds} step={.01} value={word.endSeconds} onChange={(event) => update(index, { endSeconds: Number(event.target.value) })} />
      <button className="icon-button small danger" aria-label={`Remove token ${index + 1}`} onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}><Trash2 size={13} /></button>
    </div>)}</div>
    <div className="caption-word-footer"><button className="secondary-button" onClick={() => { const previous = draft.at(-1); const start = previous?.endSeconds ?? 0; setDraft((current) => [...current, { text: "word", type: "word", startSeconds: start, endSeconds: Math.min(durationSeconds, start + .25) }]); }}><Plus size={14} /> Add token</button>
      <span>{draft.length} tokens · {durationSeconds.toFixed(2)}s audio</span>{(error || validation) && <div className="form-error">{error || validation}</div>}
      <div><button className="text-button" disabled={busy || !customized} onClick={() => void reset()}><RotateCcw size={13} /> Reset to generated</button><button className="primary-button" disabled={busy || Boolean(validation)} onClick={() => void save()}>{busy ? "Saving…" : "Save corrections"}</button></div>
    </div>
  </section></div>;
}

function validate(words: SpeechWord[], duration: number): string | undefined {
  if (!words.length) return "Keep at least one caption token."; let previous = 0;
  for (const [index, word] of words.entries()) { if (!word.text && word.type !== "spacing") return `Token ${index + 1} needs text.`; if (!Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds) || word.startSeconds < previous || word.endSeconds < word.startSeconds || word.endSeconds > duration + .001) return `Token ${index + 1} has invalid or out-of-order timing.`; previous = word.startSeconds; }
}
