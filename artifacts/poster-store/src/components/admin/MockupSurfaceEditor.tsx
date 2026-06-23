import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Info,
} from "lucide-react";

export interface CornerPoint {
  x: number;
  y: number;
}

export interface SurfaceCorners {
  topLeft: CornerPoint;
  topRight: CornerPoint;
  bottomRight: CornerPoint;
  bottomLeft: CornerPoint;
}

interface Props {
  backgroundImageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  initialCorners?: SurfaceCorners | null;
  detectedCorners?: SurfaceCorners | null;
  onSave: (corners: SurfaceCorners) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

type CornerKey = keyof SurfaceCorners;

const CORNER_KEYS: CornerKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

const CORNER_LABELS: Record<CornerKey, string> = {
  topLeft: "TL",
  topRight: "TR",
  bottomRight: "BR",
  bottomLeft: "BL",
};

const CORNER_COLORS: Record<CornerKey, string> = {
  topLeft: "#ef4444",
  topRight: "#22c55e",
  bottomRight: "#3b82f6",
  bottomLeft: "#f59e0b",
};

const CORNER_LABELS_LONG: Record<CornerKey, string> = {
  topLeft: "Top-left",
  topRight: "Top-right",
  bottomRight: "Bottom-right",
  bottomLeft: "Bottom-left",
};

// ─── Pure coordinate helpers ─────────────────────────────────────────────────
// These functions have no side effects and can be unit-tested independently.

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a default surface inset 15% from each edge. */
function defaultCorners(iw: number, ih: number): SurfaceCorners {
  const r = 0.15;
  return {
    topLeft:     { x: r * iw,       y: r * ih },
    topRight:    { x: (1 - r) * iw, y: r * ih },
    bottomRight: { x: (1 - r) * iw, y: (1 - r) * ih },
    bottomLeft:  { x: r * iw,       y: (1 - r) * ih },
  };
}

/**
 * normalizedToImage — 0-1 normalized → image-space pixels.
 * Round-trips with imageToNormalized.
 */
export function normalizedToImage(c: SurfaceCorners, iw: number, ih: number): SurfaceCorners {
  const conv = (p: CornerPoint) => ({ x: round3(p.x * iw), y: round3(p.y * ih) });
  return {
    topLeft: conv(c.topLeft), topRight: conv(c.topRight),
    bottomRight: conv(c.bottomRight), bottomLeft: conv(c.bottomLeft),
  };
}

/**
 * imageToNormalized — image-space pixels → 0-1 normalized.
 * Round-trips with normalizedToImage.
 */
export function imageToNormalized(c: SurfaceCorners, iw: number, ih: number): SurfaceCorners {
  const conv = (p: CornerPoint) => ({ x: round3(p.x / iw), y: round3(p.y / ih) });
  return {
    topLeft: conv(c.topLeft), topRight: conv(c.topRight),
    bottomRight: conv(c.bottomRight), bottomLeft: conv(c.bottomLeft),
  };
}

function validatePixelCorners(c: SurfaceCorners, iw: number, ih: number): string | null {
  const pts = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  for (const pt of pts) {
    if (pt.x < 0 || pt.y < 0 || pt.x > iw || pt.y > ih) {
      return "All corners must be within the image bounds";
    }
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const bboxW = Math.max(...xs) - Math.min(...xs);
  const bboxH = Math.max(...ys) - Math.min(...ys);
  if (bboxW < iw * 0.01) return "Surface is too narrow (width < 1% of image)";
  if (bboxH < ih * 0.01) return "Surface is too short (height < 1% of image)";
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MockupSurfaceEditor({
  backgroundImageUrl,
  imageWidth,
  imageHeight,
  initialCorners,
  detectedCorners,
  onSave,
  onCancel,
  saving = false,
}: Props) {
  const iw = imageWidth ?? 1000;
  const ih = imageHeight ?? 1000;

  // Corners are stored in IMAGE-SPACE PIXELS (0 … iw, 0 … ih).
  const [corners, setCorners] = useState<SurfaceCorners>(() => {
    if (initialCorners) return normalizedToImage(initialCorners, iw, ih);
    if (detectedCorners) return normalizedToImage(detectedCorners, iw, ih);
    return defaultCorners(iw, ih);
  });

  const [selectedCorner, setSelectedCorner] = useState<CornerKey | null>("topLeft");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [validationError, setValidationError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Live-state refs for non-React event handlers (wheel) ──────────────────
  // useLayoutEffect keeps them updated synchronously before each paint.
  const stateRef = useRef({ zoom, pan });
  useLayoutEffect(() => {
    stateRef.current = { zoom, pan };
  });

  // ── Drag ref ──────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    corner: CornerKey;
    /** Cursor offset from corner centre in image-space pixels at drag start. */
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Validate whenever corners change
  useEffect(() => {
    setValidationError(validatePixelCorners(corners, iw, ih));
  }, [corners, iw, ih]);

  // ── Transform helpers ─────────────────────────────────────────────────────
  //
  // The editor uses ONE coordinate system: image-space pixels (0…iw, 0…ih).
  // Screen rendering is done by a single CSS transform on a content layer
  // that contains BOTH the <img> and the <svg>, so they are always locked.
  //
  // getEditorTransform() describes that CSS transform.
  // screenToImage()      converts viewport pointer coords to image pixels.
  // imageToScreen()      converts image pixels to container-relative pixels
  //                      (useful for debug/display — not used for rendering).

  /** The CSS transform applied to the content layer. */
  const getEditorTransform = useCallback(() => {
    return { scale: zoom, tx: pan.x, ty: pan.y };
  }, [zoom, pan]);

  /**
   * screenToImage — converts viewport clientX/clientY to image-space pixels.
   *
   * Accounts for:
   *  • Container position in the page (getBoundingClientRect)
   *  • Current pan offset
   *  • Current zoom scale
   *
   * Round-trip: imageToScreen(screenToImage(pt)) ≈ pt
   */
  const screenToImage = useCallback(
    (clientX: number, clientY: number): CornerPoint => {
      const rect = containerRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top  - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  /**
   * imageToScreen — converts image-space pixels to container-relative CSS pixels.
   * (Used only for external callers / tests, not needed for rendering.)
   */
  const imageToScreen = useCallback(
    (pt: CornerPoint): CornerPoint => ({
      x: pt.x * zoom + pan.x,
      y: pt.y * zoom + pan.y,
    }),
    [zoom, pan]
  );

  // Expose helpers on window in dev so the browser console can test them
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__surfaceEditor = {
        getEditorTransform,
        screenToImage,
        imageToScreen,
        normalizedToImage: (c: SurfaceCorners) => normalizedToImage(c, iw, ih),
        imageToNormalized: (c: SurfaceCorners) => imageToNormalized(c, iw, ih),
      };
    }
  }, [getEditorTransform, screenToImage, imageToScreen, iw, ih]);

  // ── Fit-to-container ──────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerW = el.clientWidth;
    const containerH = el.clientHeight;
    const padding = 32;
    const newZoom = Math.max(
      0.05,
      Math.min(
        (containerW - padding * 2) / iw,
        (containerH - padding * 2) / ih
      )
    );
    setZoom(newZoom);
    setPan({
      x: (containerW - iw * newZoom) / 2,
      y: (containerH - ih * newZoom) / 2,
    });
  }, [iw, ih]);

  useEffect(() => {
    fitView();
  }, [fitView]);

  // ── Wheel zoom (toward cursor, non-passive) ───────────────────────────────
  //
  // Attached via addEventListener with { passive: false } so preventDefault
  // reliably suppresses page scroll. The handler reads zoom/pan from stateRef
  // to avoid stale closures without needing to re-register on every render.

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = el.getBoundingClientRect();
      // Cursor position relative to container
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { zoom: z, pan: p } = stateRef.current;
      const newZoom = clamp(z * factor, 0.05, 16);
      const ratio = newZoom / z;
      // Zoom toward cursor: cx = pan.x + imgX * z  →  imgX = (cx - pan.x) / z
      // After zoom: new_pan.x = cx - imgX * newZoom = cx - (cx - pan.x) * ratio
      setZoom(newZoom);
      setPan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // stableRef — runs once; stateRef provides fresh values
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Corner dragging ───────────────────────────────────────────────────────
  //
  // All pointer coordinates are converted through screenToImage() so that
  // zoom, pan, and container position are all accounted for correctly.

  const startDragCorner = useCallback(
    (e: React.PointerEvent, corner: CornerKey) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setSelectedCorner(corner);
      // Compute the cursor's offset from the corner centre in image pixels.
      // Subtracting this offset during move keeps the corner "under" the cursor.
      const imgPt = screenToImage(e.clientX, e.clientY);
      dragRef.current = {
        corner,
        offsetX: imgPt.x - corners[corner].x,
        offsetY: imgPt.y - corners[corner].y,
      };
    },
    [corners, screenToImage]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        const { corner, offsetX, offsetY } = dragRef.current;
        const imgPt = screenToImage(e.clientX, e.clientY);
        setCorners((prev) => ({
          ...prev,
          [corner]: {
            x: round3(clamp(imgPt.x - offsetX, 0, iw)),
            y: round3(clamp(imgPt.y - offsetY, 0, ih)),
          },
        }));
        return;
      }
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.mx;
        const dy = e.clientY - panStart.current.my;
        setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
      }
    },
    [screenToImage, iw, ih]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    isPanning.current = false;
  }, []);

  // ── Canvas panning (middle mouse or Alt+drag) ─────────────────────────────

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1 || e.altKey) {
        e.preventDefault();
        isPanning.current = true;
        panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [pan]
  );

  // ── Keyboard nudging (image-space pixels, zoom-independent) ──────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedCorner) return;
      const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (!arrows.includes(e.key)) return;
      e.preventDefault();

      const step = e.shiftKey ? 10 : 1;
      setCorners((prev) => {
        const pt = prev[selectedCorner];
        let nx = pt.x;
        let ny = pt.y;
        if (e.key === "ArrowLeft")  nx = clamp(pt.x - step, 0, iw);
        if (e.key === "ArrowRight") nx = clamp(pt.x + step, 0, iw);
        if (e.key === "ArrowUp")    ny = clamp(pt.y - step, 0, ih);
        if (e.key === "ArrowDown")  ny = clamp(pt.y + step, 0, ih);
        return { ...prev, [selectedCorner]: { x: round3(nx), y: round3(ny) } };
      });
    },
    [selectedCorner, iw, ih]
  );

  // ── Input field helpers ───────────────────────────────────────────────────

  const handleInputChange = (corner: CornerKey, axis: "x" | "y", raw: string) => {
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    const maxVal = axis === "x" ? iw : ih;
    setCorners((prev) => ({
      ...prev,
      [corner]: { ...prev[corner], [axis]: round3(clamp(val, 0, maxVal)) },
    }));
    setSelectedCorner(corner);
  };

  // ── Reset helpers ─────────────────────────────────────────────────────────

  const resetToDetected = () => {
    if (!detectedCorners) return;
    setCorners(normalizedToImage(detectedCorners, iw, ih));
  };

  const resetToCentered = () => {
    setCorners(defaultCorners(iw, ih));
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (validationError) return;
    const normalized = imageToNormalized(corners, iw, ih);
    await onSave(normalized);
  };

  // ── SVG polygon points (image-pixel space) ────────────────────────────────
  // No transform needed — the SVG viewBox IS the image pixel space.

  const polyPoints = CORNER_KEYS.map((k) => `${corners[k].x},${corners[k].y}`).join(" ");

  // ── Zoom controls ─────────────────────────────────────────────────────────

  const zoomIn  = () => setZoom((z) => clamp(z * 1.25, 0.05, 16));
  const zoomOut = () => setZoom((z) => clamp(z / 1.25, 0.05, 16));
  const zoomPct = Math.round(zoom * 100);

  // Handle radius in image pixels that results in ~8 CSS px on screen
  const handleR = Math.max(3, 8 / zoom);
  const strokeScale = 1 / zoom; // keeps stroke visually ~1 CSS px

  return (
    <div className="flex flex-col gap-3" style={{ userSelect: "none" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded border px-1.5 py-1">
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={zoomOut}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[36px] text-center">{zoomPct}%</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={zoomIn}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={fitView}>
          <Maximize2 className="w-3 h-3" />
          Fit
        </Button>
        {detectedCorners && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={resetToDetected}
          >
            <RotateCcw className="w-3 h-3" />
            Reset to detected
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
          onClick={resetToCentered}
        >
          <RotateCcw className="w-3 h-3" />
          Centered default
        </Button>
        <p className="text-[10px] text-muted-foreground ml-auto">
          Arrow keys nudge · Shift = 10 px · Alt+drag or middle-mouse to pan · scroll to zoom
        </p>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      {/*                                                                        */}
      {/* Architecture: ONE content layer carries both <img> and <svg>.          */}
      {/* CSS transform on that layer handles all zoom & pan.                    */}
      {/* SVG viewBox="0 0 iw ih" makes SVG coords == image pixels.              */}
      {/* Polygon points and handle positions are raw image pixels — no          */}
      {/* manual scaling math needed.                                            */}
      <div
        ref={containerRef}
        className="relative rounded-md border bg-checkerboard overflow-hidden cursor-crosshair"
        style={{ height: 440, touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={onCanvasPointerDown}
        onKeyDown={onKeyDown}
        tabIndex={0}
        aria-label="Surface editor canvas — use arrow keys to nudge selected corner"
      >
        {/* Single content layer: image + SVG share the same CSS transform */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: iw,
            height: ih,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          {/* Template background image at natural size */}
          <img
            src={backgroundImageUrl}
            alt="Mockup template"
            draggable={false}
            width={iw}
            height={ih}
            style={{
              display: "block",
              width: iw,
              height: ih,
              pointerEvents: "none",
              imageRendering: zoom > 2 ? "pixelated" : "auto",
            }}
          />

          {/* SVG overlay — coordinate space = image pixels (viewBox matches) */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
            width={iw}
            height={ih}
            viewBox={`0 0 ${iw} ${ih}`}
            onPointerDown={(e) => {
              // Clicks on SVG background (not on a handle) → pan
              if (e.target === e.currentTarget) onCanvasPointerDown(e);
            }}
          >
            {/* Surface polygon — vectorEffect keeps stroke visually constant */}
            <polygon
              points={polyPoints}
              fill="rgba(59,130,246,0.15)"
              stroke="rgba(59,130,246,0.8)"
              strokeWidth={1.5 * strokeScale}
              strokeDasharray={`${5 * strokeScale} ${3 * strokeScale}`}
            />

            {/* Corner handles — positioned in image pixels */}
            {CORNER_KEYS.map((key) => {
              const pt = corners[key];
              const color = CORNER_COLORS[key];
              const isSelected = selectedCorner === key;
              const r = isSelected ? handleR * 1.2 : handleR;
              return (
                <g
                  key={key}
                  onPointerDown={(e) => startDragCorner(e, key)}
                  onClick={() => setSelectedCorner(key)}
                  style={{ cursor: "grab" }}
                >
                  {/* Larger invisible hit area for easier grabbing */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={r * 1.8}
                    fill="transparent"
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={r}
                    fill={color}
                    stroke="white"
                    strokeWidth={2 * strokeScale}
                    style={{
                      filter: isSelected
                        ? `drop-shadow(0 0 ${3 * strokeScale}px rgba(0,0,0,0.5))`
                        : undefined,
                    }}
                  />
                  <text
                    x={pt.x}
                    y={pt.y + 0.5 * strokeScale}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9 * strokeScale}
                    fontWeight={700}
                    fill="white"
                    style={{ pointerEvents: "none" }}
                  >
                    {CORNER_LABELS[key]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Coordinate inputs (image-space pixels) */}
      <div className="grid grid-cols-2 gap-3">
        {CORNER_KEYS.map((key) => {
          const pt = corners[key];
          const color = CORNER_COLORS[key];
          const isSelected = selectedCorner === key;
          return (
            <div
              key={key}
              className={cn(
                "rounded border p-2.5 space-y-1.5 cursor-pointer transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              )}
              style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              onClick={() => setSelectedCorner(key)}
            >
              <p className="text-[11px] font-medium text-foreground">{CORNER_LABELS_LONG[key]}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">X (px)</Label>
                  <Input
                    type="number"
                    value={Math.round(pt.x)}
                    onChange={(e) => handleInputChange(key, "x", e.target.value)}
                    onFocus={() => setSelectedCorner(key)}
                    className="h-7 text-xs"
                    min={0}
                    max={iw}
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Y (px)</Label>
                  <Input
                    type="number"
                    value={Math.round(pt.y)}
                    onChange={(e) => handleInputChange(key, "y", e.target.value)}
                    onFocus={() => setSelectedCorner(key)}
                    className="h-7 text-xs"
                    min={0}
                    max={ih}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                {round3((pt.x / iw) * 100)}% × {round3((pt.y / ih) * 100)}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {validationError}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md border border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20 px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 text-blue-500" />
        <span>
          Saving corners enables <strong>perspective rendering</strong> — the poster artwork is
          warped to fit angled or tilted surfaces. Sync mockups to regenerate images.
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onCancel} disabled={saving}>
          <X className="w-3.5 h-3.5" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={handleSave}
          disabled={!!validationError || saving}
        >
          {saving ? (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Save surface
        </Button>
      </div>
    </div>
  );
}
