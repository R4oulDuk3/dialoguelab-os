"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Trash2, Upload } from "lucide-react";
import type { LocalFontRecord, ProjectCaptionStyle } from "@/shared/contracts";
import { CAPTION_PRESETS } from "@/shared/project-timeline";
import { dialogueApi } from "@/lib/client-api";

const fallbackFonts: ProjectCaptionStyle["fontFamily"][] = ["Inter", "Montserrat", "Anton", "Poppins", "Bebas Neue", "Roboto Condensed", "Titan One", "DM Serif Display", "Luckiest Guy", "Teko", "Nunito", "IBM Plex Mono", "Playfair Display", "Lilita One", "Caveat", "Oswald", "Manrope", "Inter Tight", "League Spartan", "Rubik", "Fjalla One", "Silkscreen"];
const presetMeta: Record<Exclude<ProjectCaptionStyle["presetId"], "custom">, { name: string; source: string }> = {
  "dialogue-bold": { name: "Dialogue Bold", source: "Dialogue Lab Local" }, classic: { name: "Classic", source: "Dialogue Lab Local" }, minimal: { name: "Minimal", source: "Dialogue Lab Local" }, karaoke: { name: "Karaoke", source: "Dialogue Lab Local" },
  "dl-default": { name: "Default", source: "Original Dialogue Lab" }, "dl-tiktok-pop": { name: "TikTok Pop", source: "Original Dialogue Lab" },
  "dl-cinematic-serif": { name: "Cinematic Serif", source: "Original Dialogue Lab" }, "dl-boxed-highlighter": { name: "Boxed Highlighter", source: "Original Dialogue Lab" },
  "dl-comic-punch": { name: "Comic Punch", source: "Original Dialogue Lab" }, "dl-cyberpunk-grid": { name: "Cyberpunk Grid", source: "Original Dialogue Lab" },
  "dl-soft-rounded": { name: "Soft Rounded", source: "Original Dialogue Lab" }, "dl-card-highlight": { name: "Card Highlight", source: "Original Dialogue Lab" },
  "dl-hard-outline": { name: "Hard Outline", source: "Original Dialogue Lab" }, "dl-pastel-duo": { name: "Pastel Duo", source: "Original Dialogue Lab" },
  "dl-mono-terminal": { name: "Mono Terminal", source: "Original Dialogue Lab" }, "dl-vintage-film": { name: "Vintage Film", source: "Original Dialogue Lab" },
  "dl-bubble-gum": { name: "Bubble Gum", source: "Original Dialogue Lab" }, "dl-handwritten-notes": { name: "Handwritten Notes", source: "Original Dialogue Lab" },
  "dl-wide-impact": { name: "Wide Impact", source: "Original Dialogue Lab" }, "dl-clean-minimal": { name: "Clean Minimal", source: "Original Dialogue Lab" },
  "dl-upper-third": { name: "Upper Third", source: "Original Dialogue Lab" }, "dl-caption-bar": { name: "Caption Bar", source: "Original Dialogue Lab" },
  "dl-contrast-drop": { name: "Contrast Drop", source: "Original Dialogue Lab" }, "dl-headline-condensed": { name: "Headline Condensed", source: "Original Dialogue Lab" },
  "dl-retro-pixel": { name: "Retro Pixel", source: "Original Dialogue Lab" }, "fsp-classic": { name: "Full Stack Peter", source: "FSP Original" },
  "hf-block-pop": { name: "Block Pop", source: "HyperFrames" }, "hf-cobalt-chip": { name: "Cobalt Chip", source: "HyperFrames" }, "hf-broadside": { name: "Broadside", source: "HyperFrames" },
  "hf-capsule": { name: "Capsule", source: "HyperFrames" }, "hf-editorial": { name: "Editorial", source: "HyperFrames" }, "hf-code-underline": { name: "Code Underline", source: "HyperFrames" },
};

export function SubtitleStylePanel({ style, canvasHeight, onChange }: { style: ProjectCaptionStyle; canvasHeight: number; onChange: (patch: Partial<ProjectCaptionStyle>) => Promise<void> }) {
  const [fonts, setFonts] = useState<LocalFontRecord[]>([]); const [fontFamily, setFontFamily] = useState(""); const [fontFile, setFontFile] = useState<File>(); const [fontBusy, setFontBusy] = useState(false); const [fontError, setFontError] = useState<string>();
  useEffect(() => { void dialogueApi.fonts.list().then(setFonts).catch((error) => setFontError(error instanceof Error ? error.message : String(error))); }, []);
  useEffect(() => { if (!fonts.length) return; const element = document.createElement("style"); element.dataset.dialoguelabFonts = "true";
    element.textContent = fonts.map((font) => `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(font.fontUrl)}) format(${JSON.stringify(font.format)});font-display:swap}`).join("\n"); document.head.append(element); return () => element.remove(); }, [fonts]);
  async function importFont() { if (!fontFile || !fontFamily.trim()) return; setFontBusy(true); setFontError(undefined); try { const imported = await dialogueApi.fonts.import({ family: fontFamily, file: { name: fontFile.name, mimeType: fontFile.type, bytes: new Uint8Array(await fontFile.arrayBuffer()) } }); setFonts((current) => [...current, imported]); setFontFamily(""); setFontFile(undefined); await onChange({ fontFamily: imported.family }); }
    catch (error) { setFontError(error instanceof Error ? error.message : String(error)); } finally { setFontBusy(false); } }
  async function removeSelectedFont() { const selected = fonts.find((font) => font.family === style.fontFamily); if (!selected || selected.source !== "imported") return; setFontBusy(true); setFontError(undefined); try { await onChange({ fontFamily: "Inter" }); await dialogueApi.fonts.remove(selected.id); setFonts((current) => current.filter((font) => font.id !== selected.id)); }
    catch (error) { setFontError(error instanceof Error ? error.message : String(error)); } finally { setFontBusy(false); } }
  return <div className="dialogue-panel-scroll subtitle-style-panel">
    <section className="subtitle-section"><div className="panel-section-heading"><strong>Caption styles</strong><span>All original Dialogue Lab presets, the canonical FSP look, and HyperFrames adaptations.</span></div><div className="caption-presets">{Object.values(CAPTION_PRESETS).map((preset) => { const meta = presetMeta[preset.presetId as Exclude<ProjectCaptionStyle["presetId"], "custom">]; return <button key={preset.presetId} aria-pressed={style.presetId === preset.presetId} className={style.presetId === preset.presetId ? "selected" : ""} onClick={() => void onChange({ ...preset, verticalPositionPx: preset.verticalPositionPx / 1920 * canvasHeight })}><span className="caption-preset-stage"><span className="caption-preset-surface" style={surfacePreviewStyle(preset)}><span style={wordPreviewStyle(preset, false)}>HELLO</span><em style={wordPreviewStyle(preset, true)}>THERE</em></span></span><span className="caption-preset-copy"><b>{meta.name}</b><small>{meta.source}</small></span>{style.presetId === preset.presetId && <Check size={14} />}</button>; })}</div></section>
    <section className="subtitle-section"><div className="panel-section-heading"><strong>Typography</strong><span>Bundled fonts remain available offline.</span></div><div className="caption-control-grid">
      <Control label="Font"><select value={style.fontFamily} onChange={(event) => void onChange({ fontFamily: event.target.value as ProjectCaptionStyle["fontFamily"] })}>{(fonts.length ? fonts.map((font) => font.family) : fallbackFonts).map((font) => <option key={font}>{font}</option>)}</select></Control>
      <Control label="Weight"><select value={style.fontWeight} onChange={(event) => void onChange({ fontWeight: Number(event.target.value) as ProjectCaptionStyle["fontWeight"] })}>{[400,500,600,700,800,900].map((weight) => <option key={weight}>{weight}</option>)}</select></Control>
      <Control label="Transform"><select value={style.textTransform} onChange={(event) => void onChange({ textTransform: event.target.value as ProjectCaptionStyle["textTransform"] })}>{["none","uppercase","lowercase","capitalize"].map((value) => <option key={value}>{value}</option>)}</select></Control>
      <Range label="Size" value={style.fontSizePx} min={24} max={180} suffix="px" onChange={(fontSizePx) => onChange({ fontSizePx })} />
      <Color label="Text" value={style.textColor} onChange={(textColor) => onChange({ textColor })} /><Range label="Line height" value={style.lineHeight} min={.8} max={1.6} step={.05} onChange={(lineHeight) => onChange({ lineHeight })} />
    </div><div className="offline-font-manager"><div><strong>Offline font library</strong><span>Imported fonts stay local.</span></div><input value={fontFamily} maxLength={80} onChange={(event) => setFontFamily(event.target.value)} placeholder="Font family name" /><label className="font-file-button"><Upload size={12} />{fontFile?.name || "Choose font file"}<input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" onChange={(event) => setFontFile(event.target.files?.[0])} /></label><button className="font-import-button" disabled={!fontFile || !fontFamily.trim() || fontBusy} onClick={() => void importFont()}>{fontBusy ? <LoaderCircle className="spin" size={12} /> : <Upload size={12} />} Import locally</button>{fonts.find((font) => font.family === style.fontFamily)?.source === "imported" && <button className="font-remove-button" disabled={fontBusy} onClick={() => void removeSelectedFont()}><Trash2 size={12} /> Remove selected</button>}{fontError && <small>{fontError}</small>}</div></section>
    <section className="subtitle-section"><div className="panel-section-heading"><strong>Word emphasis</strong><span>HyperFrames-style upcoming, active, and spoken word states.</span></div><div className="caption-control-grid">
      <Control label="Active word treatment"><select value={style.activeWordEmphasis} onChange={(event) => void onChange({ activeWordEmphasis: event.target.value as ProjectCaptionStyle["activeWordEmphasis"] })}><option value="text">Text color</option><option value="highlight">Highlight chip</option><option value="underline">Underline</option></select></Control>
      <Color label="Accent" value={style.activeWordColor} onChange={(activeWordColor) => onChange({ activeWordColor })} />
      <Color label="Active text" value={style.activeWordTextColor} onChange={(activeWordTextColor) => onChange({ activeWordTextColor })} />
      <Range label="Active radius" value={style.activeWordRadiusPx} min={0} max={40} suffix="px" onChange={(activeWordRadiusPx) => onChange({ activeWordRadiusPx })} />
      <Range label="Active scale" value={style.activeWordScale} min={.5} max={2} step={.05} suffix="×" onChange={(activeWordScale) => onChange({ activeWordScale })} />
      <Range label="Upcoming opacity" value={style.inactiveWordOpacity} min={.1} max={1} step={.05} onChange={(inactiveWordOpacity) => onChange({ inactiveWordOpacity })} />
      <Range label="Word spacing" value={style.wordGapEm} min={0} max={.8} step={.02} suffix="em" onChange={(wordGapEm) => onChange({ wordGapEm })} />
    </div></section>
    <section className="subtitle-section"><div className="panel-section-heading"><strong>Outline & shadow</strong><span>Keep captions readable over moving backgrounds.</span></div><div className="caption-control-grid">
      <Color label="Outline" value={style.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} /><Range label="Outline width" value={style.strokeWidthPx} min={0} max={24} suffix="px" onChange={(strokeWidthPx) => onChange({ strokeWidthPx })} />
      <Control label="Shadow"><button className={`caption-toggle ${style.shadowEnabled ? "active" : ""}`} onClick={() => void onChange({ shadowEnabled: !style.shadowEnabled })}>{style.shadowEnabled ? "Enabled" : "Disabled"}</button></Control><Color label="Shadow color" value={style.shadowColor} onChange={(shadowColor) => onChange({ shadowColor })} />
      <Range label="Shadow blur" value={style.shadowBlurPx} min={0} max={40} suffix="px" onChange={(shadowBlurPx) => onChange({ shadowBlurPx })} /><Range label="Opacity" value={style.shadowOpacity} min={0} max={1} step={.05} onChange={(shadowOpacity) => onChange({ shadowOpacity })} />
      <Range label="Offset X" value={style.shadowOffsetX} min={-20} max={20} suffix="px" onChange={(shadowOffsetX) => onChange({ shadowOffsetX })} /><Range label="Offset Y" value={style.shadowOffsetY} min={-20} max={20} suffix="px" onChange={(shadowOffsetY) => onChange({ shadowOffsetY })} />
    </div></section>
    <section className="subtitle-section"><div className="panel-section-heading"><strong>Caption surface</strong><span>Add a card, pill, border, or hard-offset shadow behind each caption page.</span></div><div className="caption-control-grid">
      <Control label="Surface"><button className={`caption-toggle ${style.surfaceEnabled ? "active" : ""}`} onClick={() => void onChange({ surfaceEnabled: !style.surfaceEnabled })}>{style.surfaceEnabled ? "Enabled" : "Disabled"}</button></Control>
      <Color label="Fill" value={style.surfaceColor} onChange={(surfaceColor) => onChange({ surfaceColor })} />
      <Range label="Fill opacity" value={style.surfaceOpacity} min={0} max={1} step={.05} onChange={(surfaceOpacity) => onChange({ surfaceOpacity })} />
      <Color label="Border" value={style.surfaceBorderColor} onChange={(surfaceBorderColor) => onChange({ surfaceBorderColor })} />
      <Range label="Border width" value={style.surfaceBorderWidthPx} min={0} max={16} suffix="px" onChange={(surfaceBorderWidthPx) => onChange({ surfaceBorderWidthPx })} />
      <Range label="Corner radius" value={style.surfaceBorderRadiusPx} min={0} max={80} suffix="px" onChange={(surfaceBorderRadiusPx) => onChange({ surfaceBorderRadiusPx })} />
      <Range label="Padding X" value={style.surfacePaddingX} min={0} max={120} suffix="px" onChange={(surfacePaddingX) => onChange({ surfacePaddingX })} />
      <Range label="Padding Y" value={style.surfacePaddingY} min={0} max={80} suffix="px" onChange={(surfacePaddingY) => onChange({ surfacePaddingY })} />
      <Color label="Surface shadow" value={style.surfaceShadowColor} onChange={(surfaceShadowColor) => onChange({ surfaceShadowColor })} />
      <Range label="Shadow opacity" value={style.surfaceShadowOpacity} min={0} max={1} step={.05} onChange={(surfaceShadowOpacity) => onChange({ surfaceShadowOpacity })} />
      <Range label="Shadow X" value={style.surfaceShadowOffsetX} min={-30} max={30} suffix="px" onChange={(surfaceShadowOffsetX) => onChange({ surfaceShadowOffsetX })} />
      <Range label="Shadow Y" value={style.surfaceShadowOffsetY} min={-30} max={30} suffix="px" onChange={(surfaceShadowOffsetY) => onChange({ surfaceShadowOffsetY })} />
      <Range label="Shadow blur" value={style.surfaceShadowBlurPx} min={0} max={60} suffix="px" onChange={(surfaceShadowBlurPx) => onChange({ surfaceShadowBlurPx })} />
    </div></section>
    <section className="subtitle-section"><div className="panel-section-heading"><strong>Layout</strong><span>Position and page captions inside the safe area.</span></div><div className="caption-control-grid">
      <Control label="Position"><select value={style.position} onChange={(event) => { const position = event.target.value as ProjectCaptionStyle["position"]; void onChange({ position, verticalPositionPx: position === "top" ? canvasHeight * style.edgeOffsetPercent / 100 : position === "middle" ? canvasHeight / 2 : canvasHeight * (1 - style.edgeOffsetPercent / 100) }); }}>{["top","middle","bottom"].map((value) => <option key={value}>{value}</option>)}</select></Control>
      <Control label="Alignment"><select value={style.alignment} onChange={(event) => void onChange({ alignment: event.target.value as ProjectCaptionStyle["alignment"] })}>{["left","center","right"].map((value) => <option key={value}>{value}</option>)}</select></Control>
      <Range label="Edge offset" value={style.edgeOffsetPercent} min={0} max={30} suffix="%" onChange={(edgeOffsetPercent) => onChange({ edgeOffsetPercent, ...(style.position === "middle" ? {} : { verticalPositionPx: style.position === "top" ? canvasHeight * edgeOffsetPercent / 100 : canvasHeight * (1 - edgeOffsetPercent / 100) }) })} /><Range label="Max width" value={style.maxWidthPercent} min={40} max={96} suffix="%" onChange={(maxWidthPercent) => onChange({ maxWidthPercent })} />
      <Range label="Vertical position" value={style.verticalPositionPx} min={0} max={canvasHeight} suffix="px" onChange={(verticalPositionPx) => onChange({ verticalPositionPx })} />
      <Range label="Caption switch" value={style.switchCaptionsEveryMs} min={100} max={5000} step={50} suffix="ms" onChange={(switchCaptionsEveryMs) => onChange({ switchCaptionsEveryMs })} />
      <Range label="Words per page" value={style.wordsPerPage} min={1} max={8} step={1} onChange={(wordsPerPage) => onChange({ wordsPerPage: Math.round(wordsPerPage) })} />
    </div></section>
    <div className="caption-live-sample"><span className="caption-preset-surface" style={surfacePreviewStyle(style)}><span style={wordPreviewStyle(style, false)}>THIS IS YOUR</span><em style={wordPreviewStyle(style, true)}>CAPTION</em></span></div>
  </div>;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) { return <label className="caption-control"><span>{label}</span>{children}</label>; }
function Range({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => { setDraft(value); committed.current = value; }, [value]);
  const commit = () => {
    if (draft === committed.current) return;
    committed.current = draft;
    void onChange(draft);
  };
  return <Control label={`${label} · ${Number(draft.toFixed(2))}${suffix}`}><input type="range" min={min} max={max} step={step} value={draft} onChange={(event) => setDraft(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></Control>;
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => { setDraft(value); committed.current = value; }, [value]);
  const commit = () => {
    if (draft === committed.current) return;
    committed.current = draft;
    void onChange(draft);
  };
  return <Control label={`${label} · ${draft}`}><div className="caption-color"><input type="color" value={draft} onChange={(event) => setDraft(event.target.value.toUpperCase())} onBlur={commit} onKeyUp={commit} /><span style={{ background: draft }} /></div></Control>;
}
function surfacePreviewStyle(style: ProjectCaptionStyle): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: `${style.wordGapEm}em`, maxWidth: "94%",
    padding: style.surfaceEnabled ? `${Math.max(4, style.surfacePaddingY / 3)}px ${Math.max(7, style.surfacePaddingX / 3)}px` : 0,
    color: style.textColor, background: style.surfaceEnabled ? hexToRgbaCss(style.surfaceColor, style.surfaceOpacity) : "transparent",
    border: style.surfaceEnabled && style.surfaceBorderWidthPx ? `${Math.max(1, style.surfaceBorderWidthPx / 2)}px solid ${style.surfaceBorderColor}` : "none",
    borderRadius: style.surfaceEnabled ? Math.min(999, style.surfaceBorderRadiusPx / 2) : 0,
    boxShadow: style.surfaceEnabled && style.surfaceShadowOpacity ? `${style.surfaceShadowOffsetX / 2}px ${style.surfaceShadowOffsetY / 2}px ${style.surfaceShadowBlurPx / 2}px ${hexToRgbaCss(style.surfaceShadowColor, style.surfaceShadowOpacity)}` : "none",
    fontFamily: style.fontFamily, fontSize: 18, fontWeight: style.fontWeight, lineHeight: style.lineHeight, textTransform: style.textTransform,
    WebkitTextStroke: `${Math.min(1.5, style.strokeWidthPx / 8)}px ${style.strokeColor}`,
    textShadow: style.shadowEnabled ? `${style.shadowOffsetX / 3}px ${style.shadowOffsetY / 3}px ${style.shadowBlurPx / 3}px ${hexToRgbaCss(style.shadowColor, style.shadowOpacity)}` : "none",
  };
}

function wordPreviewStyle(style: ProjectCaptionStyle, active: boolean): React.CSSProperties {
  return {
    display: "inline-block", flex: "none", padding: "0 .04em", fontStyle: "normal", opacity: active ? 1 : style.inactiveWordOpacity,
    color: active ? style.activeWordEmphasis === "text" ? style.activeWordColor : style.activeWordTextColor : style.textColor,
    background: active && style.activeWordEmphasis === "highlight" ? style.activeWordColor : "transparent",
    borderBottom: active && style.activeWordEmphasis === "underline" ? `2px solid ${style.activeWordColor}` : "2px solid transparent",
    borderRadius: active ? style.activeWordRadiusPx / 2 : 0, transform: active ? `scale(${style.activeWordScale})` : "scale(1)",
    boxShadow: active && style.activeWordEmphasis === "highlight" ? `0 0 0 2px ${style.activeWordColor}` : "none",
  };
}

function hexToRgbaCss(hex: string, opacity: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${opacity})`;
}
