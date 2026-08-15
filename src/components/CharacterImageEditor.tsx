import { LocateFixed, Maximize2, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

const REEL_WIDTH = 1080;
const REEL_HEIGHT = 1920;
const MAX_IMAGE_SIZE = 4096;

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface CharacterImageEditorProps {
  image: { preview: string; label: string; width: number; height: number; previewXPercent: number; previewYPercent: number };
  disabled?: boolean;
  onUpdate: (patch: Partial<Pick<CharacterImageEditorProps["image"], "width" | "height" | "previewXPercent" | "previewYPercent">>) => void;
}

interface ResizeDragState {
  kind: "resize";
  handle: ResizeHandle;
  pointerX: number;
  pointerY: number;
  width: number;
  height: number;
  conceptualPixelsPerDisplayPixel: number;
}

interface MoveDragState {
  kind: "move";
  pointerX: number;
  pointerY: number;
  xPercent: number;
  yPercent: number;
  canvasWidth: number;
  canvasHeight: number;
}

type DragState = ResizeDragState | MoveDragState;
const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function CharacterImageEditor({ image, disabled, onUpdate }: CharacterImageEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | undefined>(undefined);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>();

  function startMove(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !canvasRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "move", pointerX: event.clientX, pointerY: event.clientY, xPercent: image.previewXPercent, yPercent: image.previewYPercent, canvasWidth: canvas.width, canvasHeight: canvas.height };
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.kind !== "move" || disabled) return;
    event.preventDefault();
    onUpdate({
      previewXPercent: clampPercent(start.xPercent + (event.clientX - start.pointerX) / start.canvasWidth * 100),
      previewYPercent: clampPercent(start.yPercent + (event.clientY - start.pointerY) / start.canvasHeight * 100),
    });
  }

  function stopMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = undefined;
  }

  function moveWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    onUpdate({
      previewXPercent: clampPercent(image.previewXPercent + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0)),
      previewYPercent: clampPercent(image.previewYPercent + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)),
    });
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
    if (disabled || !canvasRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "resize", handle, pointerX: event.clientX, pointerY: event.clientY, width: image.width, height: image.height, conceptualPixelsPerDisplayPixel: REEL_WIDTH / canvas.width };
  }

  function resize(event: React.PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.kind !== "resize" || disabled) return;
    event.preventDefault();
    const deltaX = (event.clientX - start.pointerX) * start.conceptualPixelsPerDisplayPixel * 2;
    const deltaY = (event.clientY - start.pointerY) * start.conceptualPixelsPerDisplayPixel * 2;
    let width = start.width;
    let height = start.height;

    if (start.handle.includes("e")) width += deltaX;
    if (start.handle.includes("w")) width -= deltaX;
    if (start.handle.includes("s")) height += deltaY;
    if (start.handle.includes("n")) height -= deltaY;
    onUpdate({ width: clampDimension(width), height: clampDimension(height) });
  }

  function stopResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = undefined;
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, handle: ResizeHandle) {
    if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : 10;
    let width = image.width;
    let height = image.height;
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && (handle.includes("e") || handle.includes("w"))) {
      const pointerDirection = event.key === "ArrowRight" ? 1 : -1;
      const edgeDirection = handle.includes("e") ? 1 : -1;
      width += pointerDirection * edgeDirection * step * 2;
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && (handle.includes("n") || handle.includes("s"))) {
      const pointerDirection = event.key === "ArrowDown" ? 1 : -1;
      const edgeDirection = handle.includes("s") ? 1 : -1;
      height += pointerDirection * edgeDirection * step * 2;
    }
    onUpdate({ width: clampDimension(width), height: clampDimension(height) });
  }

  function resetToOriginal() {
    if (!naturalSize || disabled) return;
    onUpdate({ width: clampDimension(naturalSize.width), height: clampDimension(naturalSize.height) });
  }

  function fitToScreen() {
    if (!naturalSize || disabled) return;
    const scale = Math.min(REEL_WIDTH / naturalSize.width, REEL_HEIGHT / naturalSize.height);
    onUpdate({ width: clampDimension(naturalSize.width * scale), height: clampDimension(naturalSize.height * scale), previewXPercent: 50, previewYPercent: 50 });
  }

  return <aside className="character-size-editor" aria-label={`Size ${image.label} against a 9:16 screen`}>
    <div className="character-size-editor-heading">
      <div><span>Size on screen</span><strong>{image.label || "Untitled image"}</strong></div>
      <span className="character-size-readout">{image.width} × {image.height}</span>
    </div>
    <div className="character-reel-wrap">
      <div ref={canvasRef} className="character-reel-canvas">
        <span className="character-reel-grid" aria-hidden="true" />
        <div
          className="character-resize-box"
          style={{ left: `${image.previewXPercent}%`, top: `${image.previewYPercent}%`, width: `${image.width / REEL_WIDTH * 100}%`, height: `${image.height / REEL_HEIGHT * 100}%` }}
          role="group"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Move ${image.label || "image"} on the portrait preview. Use arrow keys for precise positioning.`}
          title="Drag to reposition"
          onPointerDown={startMove}
          onPointerMove={move}
          onPointerUp={stopMove}
          onPointerCancel={stopMove}
          onKeyDown={moveWithKeyboard}
        >
          <img src={image.preview} alt="" draggable={false} onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
          {handles.map((handle) => <button
            key={handle}
            type="button"
            className="character-resize-handle"
            data-handle={handle}
            aria-label={`Resize ${handleName(handle)} edge`}
            title={`Drag the ${handleName(handle)} handle`}
            disabled={disabled}
            onPointerDown={(event) => startResize(event, handle)}
            onPointerMove={resize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            onKeyDown={(event) => resizeWithKeyboard(event, handle)}
          />)}
        </div>
        <span className="character-reel-label">9:16 · 1080 × 1920</span>
      </div>
    </div>
    <p className="character-size-help">Drag the image to preview its placement. Drag an edge to change one dimension, or a corner to change both. Final placement can still be adjusted per dialogue clip.</p>
    <div className="character-size-actions">
      <button type="button" className="secondary-button" disabled={!naturalSize || disabled} onClick={fitToScreen}><Maximize2 size={14} /> Fit screen</button>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => onUpdate({ previewXPercent: 50, previewYPercent: 50 })}><LocateFixed size={14} /> Center</button>
      <button type="button" className="secondary-button" disabled={!naturalSize || disabled} onClick={resetToOriginal}><RotateCcw size={14} /> Original size</button>
    </div>
  </aside>;
}

function clampDimension(value: number) {
  return Math.max(1, Math.min(MAX_IMAGE_SIZE, Math.round(value)));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function handleName(handle: ResizeHandle) {
  return ({ n: "top", ne: "top-right", e: "right", se: "bottom-right", s: "bottom", sw: "bottom-left", w: "left", nw: "top-left" })[handle];
}
