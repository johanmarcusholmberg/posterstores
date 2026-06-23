import { useCallback, useEffect, useRef, useState } from "react";
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

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a default surface from bbox for a given image size. */
function defaultCorners(iw: number, ih: number): SurfaceCorners {
  const r = 0.15;
  return {
    topLeft: { x: r * iw, y: r * ih },
    topRight: { x: (1 - r) * iw, y: r * ih },
    bottomRight: { x: (1 - r) * iw, y: (1 - r) * ih },
    bottomLeft: { x: r * iw, y: (1 - r) * ih },
  };
}

/** Convert normalized 0-1 corners to pixel corners for image (iw × ih). */
function normToPixel(c: SurfaceCorners, iw: number, ih: number): SurfaceCorners {
  const conv = (p: CornerPoint) => ({ x: round3(p.x * iw), y: round3(p.y * ih) });
  return {
    topLeft: conv(c.topLeft),
    topRight: conv(c.topRight),
    bottomRight: conv(c.bottomRight),
    bottomLeft: conv(c.bottomLeft),
  };
}

/** Convert pixel corners to normalized 0-1. */
function pixelToNorm(c: SurfaceCorners, iw: number, ih: number): SurfaceCorners {
  const conv = (p: CornerPoint) => ({ x: round3(p.x / iw), y: round3(p.y / ih) });
  return {
    topLeft: conv(c.topLeft),
    topRight: conv(c.topRight),
    bottomRight: conv(c.bottomRight),
    bottomLeft: conv(c.bottomLeft),
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

  // Pixel-space corners (relative to the natural image size)
  const [corners, setCorners] = useState<SurfaceCorners>(() => {
    if (initialCorners) return normToPixel(initialCorners, iw, ih);
    if (detectedCorners) return normToPixel(detectedCorners, iw, ih);
    return defaultCorners(iw, ih);
  });

  const [selectedCorner, setSelectedCorner] = useState<CornerKey | null>("topLeft");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [validationError, setValidationError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    corner: CornerKey;
    startMx: number;
    startMy: number;
    startPx: number;
    startPy: number;
  } | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Validate whenever corners change
  useEffect(() => {
    setValidationError(validatePixelCorners(corners, iw, ih));
  }, [corners, iw, ih]);

  // ── Coordinate helpers ────────────────────────────────────────────────────

  /** Convert a pixel-space corner to the scaled display position (in CSS px within the container). */
  const toDisplay = useCallback(
    (pt: CornerPoint) => ({
      x: pt.x * zoom + pan.x,
      y: pt.y * zoom + pan.y,
    }),
    [zoom, pan]
  );

  /** Convert a CSS-px position within the container to image-pixel coords. */
  const fromDisplay = useCallback(
    (cx: number, cy: number) => ({
      x: (cx - pan.x) / zoom,
      y: (cy - pan.y) / zoom,
    }),
    [zoom, pan]
  );

  // ── Fit-to-container zoom ─────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerW = el.clientWidth;
    const containerH = el.clientHeight;
    const padding = 32;
    const newZoom = Math.min(
      (containerW - padding * 2) / iw,
      (containerH - padding * 2) / ih
    );
    const zoomClamped = Math.max(0.05, newZoom);
    setZoom(zoomClamped);
    setPan({
      x: (containerW - iw * zoomClamped) / 2,
      y: (containerH - ih * zoomClamped) / 2,
    });
  }, [iw, ih]);

  useEffect(() => {
    fitView();
  }, [fitView]);

  // ── Corner dragging ───────────────────────────────────────────────────────

  const startDragCorner = useCallback(
    (e: React.PointerEvent, corner: CornerKey) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setSelectedCorner(corner);
      dragRef.current = {
        corner,
        startMx: e.clientX,
        startMy: e.clientY,
        startPx: corners[corner].x,
        startPy: corners[corner].y,
      };
    },
    [corners]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        const dr = dragRef.current;
        const dx = (e.clientX - dr.startMx) / zoom;
        const dy = (e.clientY - dr.startMy) / zoom;
        setCorners((prev) => ({
          ...prev,
          [dr.corner]: {
            x: round3(clamp(dr.startPx + dx, 0, iw)),
            y: round3(clamp(dr.startPy + dy, 0, ih)),
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
    [zoom, iw, ih]
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

  // ── Wheel zoom ────────────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => clamp(z * factor, 0.05, 16));
  }, []);

  // ── Keyboard nudging ──────────────────────────────────────────────────────

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
        if (e.key === "ArrowLeft") nx = clamp(pt.x - step, 0, iw);
        if (e.key === "ArrowRight") nx = clamp(pt.x + step, 0, iw);
        if (e.key === "ArrowUp") ny = clamp(pt.y - step, 0, ih);
        if (e.key === "ArrowDown") ny = clamp(pt.y + step, 0, ih);
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
    setCorners(normToPixel(detectedCorners, iw, ih));
  };

  const resetToCentered = () => {
    setCorners(defaultCorners(iw, ih));
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (validationError) return;
    const normalized = pixelToNorm(corners, iw, ih);
    await onSave(normalized);
  };

  // ── Polygon points string for SVG ─────────────────────────────────────────

  const polyPoints = CORNER_KEYS.map((k) => {
    const d = toDisplay(corners[k]);
    return `${d.x},${d.y}`;
  }).join(" ");

  // ── Zoom controls ─────────────────────────────────────────────────────────

  const zoomIn = () => setZoom((z) => clamp(z * 1.25, 0.05, 16));
  const zoomOut = () => setZoom((z) => clamp(z / 1.25, 0.05, 16));

  const zoomPct = Math.round(zoom * 100);

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
          Arrow keys nudge selected corner · Shift = 10px · Alt+drag or middle-mouse to pan
        </p>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative rounded-md border bg-checkerboard overflow-hidden cursor-crosshair"
        style={{ height: 440, touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={onCanvasPointerDown}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        tabIndex={0}
        aria-label="Surface editor canvas — use arrow keys to nudge selected corner"
      >
        {/* Background image */}
        <img
          src={backgroundImageUrl}
          alt="Mockup template"
          draggable={false}
          style={{
            position: "absolute",
            left: pan.x,
            top: pan.y,
            width: iw * zoom,
            height: ih * zoom,
            pointerEvents: "none",
            imageRendering: zoom > 2 ? "pixelated" : "auto",
          }}
        />

        {/* SVG overlay */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onCanvasPointerDown(e);
          }}
        >
          {/* Surface polygon fill */}
          <polygon
            points={polyPoints}
            fill="rgba(59,130,246,0.15)"
            stroke="rgba(59,130,246,0.8)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />

          {/* Corner handles */}
          {CORNER_KEYS.map((key) => {
            const d = toDisplay(corners[key]);
            const color = CORNER_COLORS[key];
            const isSelected = selectedCorner === key;
            return (
              <g key={key}>
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={isSelected ? 8 : 6}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                  style={{ cursor: "grab", filter: isSelected ? "drop-shadow(0 0 4px rgba(0,0,0,0.5))" : undefined }}
                  onPointerDown={(e) => startDragCorner(e, key)}
                  onClick={() => setSelectedCorner(key)}
                />
                <text
                  x={d.x}
                  y={d.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
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

      {/* Coordinate inputs */}
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
                {round3(pt.x / iw * 100)}% × {round3(pt.y / ih * 100)}%
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
