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
  Hand,
  MousePointer2,
  Focus,
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

// Label offsets (in image-space pixels, scaled by strokeScale later)
// Each label nudges away from the corner so the exact pixel stays visible
const LABEL_OFFSETS: Record<CornerKey, { dx: number; dy: number }> = {
  topLeft:     { dx: -18, dy: -12 },
  topRight:    { dx:  18, dy: -12 },
  bottomRight: { dx:  18, dy:  12 },
  bottomLeft:  { dx: -18, dy:  12 },
};

// ─── Pure coordinate helpers ─────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function defaultCorners(iw: number, ih: number): SurfaceCorners {
  const r = 0.15;
  return {
    topLeft:     { x: r * iw,       y: r * ih },
    topRight:    { x: (1 - r) * iw, y: r * ih },
    bottomRight: { x: (1 - r) * iw, y: (1 - r) * ih },
    bottomLeft:  { x: r * iw,       y: (1 - r) * ih },
  };
}

export function normalizedToImage(c: SurfaceCorners, iw: number, ih: number): SurfaceCorners {
  const conv = (p: CornerPoint) => ({ x: round3(p.x * iw), y: round3(p.y * ih) });
  return {
    topLeft: conv(c.topLeft), topRight: conv(c.topRight),
    bottomRight: conv(c.bottomRight), bottomLeft: conv(c.bottomLeft),
  };
}

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

  const [corners, setCorners] = useState<SurfaceCorners>(() => {
    if (initialCorners) return normalizedToImage(initialCorners, iw, ih);
    if (detectedCorners) return normalizedToImage(detectedCorners, iw, ih);
    return defaultCorners(iw, ih);
  });

  const [selectedCorner, setSelectedCorner] = useState<CornerKey | null>("topLeft");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [panMode, setPanMode] = useState(false);
  const spaceHeld = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({ zoom, pan, panMode });
  useLayoutEffect(() => {
    stateRef.current = { zoom, pan, panMode };
  });

  const dragRef = useRef<{
    corner: CornerKey;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    setValidationError(validatePixelCorners(corners, iw, ih));
  }, [corners, iw, ih]);

  // ── Transform helpers ─────────────────────────────────────────────────────

  const getEditorTransform = useCallback(() => {
    return { scale: zoom, tx: pan.x, ty: pan.y };
  }, [zoom, pan]);

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

  const imageToScreen = useCallback(
    (pt: CornerPoint): CornerPoint => ({
      x: pt.x * zoom + pan.x,
      y: pt.y * zoom + pan.y,
    }),
    [zoom, pan]
  );

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

  // ── Fit-to-surface ────────────────────────────────────────────────────────

  const fitSurface = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerW = el.clientWidth;
    const containerH = el.clientHeight;
    const padding = 60;

    const xs = CORNER_KEYS.map((k) => corners[k].x);
    const ys = CORNER_KEYS.map((k) => corners[k].y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const surfW = maxX - minX;
    const surfH = maxY - minY;

    if (surfW < 1 || surfH < 1) return;

    const newZoom = Math.max(
      0.05,
      Math.min(16,
        Math.min(
          (containerW - padding * 2) / surfW,
          (containerH - padding * 2) / surfH
        )
      )
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: containerW / 2 - centerX * newZoom,
      y: containerH / 2 - centerY * newZoom,
    });
  }, [corners]);

  useEffect(() => {
    fitView();
  }, [fitView]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { zoom: z, pan: p } = stateRef.current;
      const newZoom = clamp(z * factor, 0.05, 16);
      const ratio = newZoom / z;
      setZoom(newZoom);
      setPan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Spacebar pan mode ─────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && document.activeElement === el) {
        e.preventDefault();
        spaceHeld.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
      }
    };

    el.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Corner dragging ───────────────────────────────────────────────────────

  const startDragCorner = useCallback(
    (e: React.PointerEvent, corner: CornerKey) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setSelectedCorner(corner);
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

  // ── Canvas panning ────────────────────────────────────────────────────────

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const shouldPan = panMode || spaceHeld.current || e.button === 1 || e.altKey;
      if (shouldPan) {
        e.preventDefault();
        isPanning.current = true;
        panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [pan, panMode]
  );

  // ── Keyboard nudging ──────────────────────────────────────────────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        spaceHeld.current = true;
        return;
      }
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

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.code === "Space") {
      spaceHeld.current = false;
    }
  }, []);

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

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  const zoomIn  = () => setZoom((z) => clamp(z * 1.25, 0.05, 16));
  const zoomOut = () => setZoom((z) => clamp(z / 1.25, 0.05, 16));

  const setZoomLevel = (level: number) => {
    const el = containerRef.current;
    if (!el) return;
    const containerW = el.clientWidth;
    const containerH = el.clientHeight;
    // Zoom toward image center
    const imgCenterX = iw / 2;
    const imgCenterY = ih / 2;
    setZoom(level);
    setPan({
      x: containerW / 2 - imgCenterX * level,
      y: containerH / 2 - imgCenterY * level,
    });
  };

  const zoomPct = Math.round(zoom * 100);

  // ── SVG rendering helpers ─────────────────────────────────────────────────

  const polyPoints = CORNER_KEYS.map((k) => `${corners[k].x},${corners[k].y}`).join(" ");
  const strokeScale = 1 / zoom;
  // Handle ring radius in image pixels that results in ~6 CSS px on screen
  const ringR = Math.max(2, 6 / zoom);
  // Crosshair arm length
  const crosshairArm = Math.max(4, 10 / zoom);

  const effectivePanMode = panMode;

  return (
    <div className="flex flex-col gap-3" style={{ userSelect: "none" }}>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Mode toggle */}
        <div className="flex items-center rounded border overflow-hidden">
          <Button
            type="button"
            variant={!effectivePanMode ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7 rounded-none"
            title="Select / move corners"
            onClick={() => setPanMode(false)}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant={effectivePanMode ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7 rounded-none"
            title="Pan mode — drag to move around"
            onClick={() => setPanMode(true)}
          >
            <Hand className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 rounded border px-1 py-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={zoomOut} title="Zoom out">
            <ZoomOut className="w-3 h-3" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[36px] text-center tabular-nums">{zoomPct}%</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={zoomIn} title="Zoom in">
            <ZoomIn className="w-3 h-3" />
          </Button>
        </div>

        {/* Preset zoom levels */}
        {([100, 200, 400] as const).map((level) => (
          <Button
            key={level}
            type="button"
            variant={zoomPct === level ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setZoomLevel(level / 100)}
          >
            {level}%
          </Button>
        ))}

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Fit controls */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={fitView}
          title="Fit the full template image in view"
        >
          <Maximize2 className="w-3 h-3" />
          Fit image
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={fitSurface}
          title="Zoom and center on the current poster surface"
        >
          <Focus className="w-3 h-3" />
          Fit surface
        </Button>

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Reset helpers */}
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
          Center default
        </Button>
      </div>

      {/* Helper text */}
      <p className="text-[10px] text-muted-foreground">
        Use <strong>Pan mode</strong> or hold <kbd className="px-1 py-0.5 rounded bg-muted border text-[9px]">Space</kbd> / <kbd className="px-1 py-0.5 rounded bg-muted border text-[9px]">Alt</kbd> and drag to move around. Scroll to zoom. Arrow keys nudge selected corner (<kbd className="px-1 py-0.5 rounded bg-muted border text-[9px]">Shift</kbd> = 10 px).
      </p>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={cn(
          "relative rounded-md border bg-checkerboard overflow-hidden",
          effectivePanMode ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        )}
        style={{ height: 440, touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={onCanvasPointerDown}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        tabIndex={0}
        aria-label="Precision surface editor — use arrow keys to nudge selected corner"
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

          {/* SVG overlay — coordinate space = image pixels */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
            width={iw}
            height={ih}
            viewBox={`0 0 ${iw} ${ih}`}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) onCanvasPointerDown(e);
            }}
          >
            {/* Surface polygon */}
            <polygon
              points={polyPoints}
              fill="rgba(59,130,246,0.10)"
              stroke="rgba(59,130,246,0.75)"
              strokeWidth={1.5 * strokeScale}
              strokeDasharray={`${5 * strokeScale} ${3 * strokeScale}`}
              pointerEvents="none"
            />

            {/* Corner handles — hollow ring + crosshair style */}
            {CORNER_KEYS.map((key) => {
              const pt = corners[key];
              const color = CORNER_COLORS[key];
              const isSelected = selectedCorner === key;
              const labelOff = LABEL_OFFSETS[key];

              return (
                <g
                  key={key}
                  onPointerDown={(e) => {
                    if (!effectivePanMode) startDragCorner(e, key);
                  }}
                  onClick={() => { if (!effectivePanMode) setSelectedCorner(key); }}
                  style={{ cursor: effectivePanMode ? "inherit" : "grab" }}
                >
                  {/* Large invisible hit area */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={ringR * 2.5}
                    fill="transparent"
                  />

                  {/* Crosshair lines (behind ring) */}
                  <line
                    x1={pt.x - crosshairArm}
                    y1={pt.y}
                    x2={pt.x + crosshairArm}
                    y2={pt.y}
                    stroke={color}
                    strokeWidth={strokeScale}
                    opacity={0.6}
                    pointerEvents="none"
                  />
                  <line
                    x1={pt.x}
                    y1={pt.y - crosshairArm}
                    x2={pt.x}
                    y2={pt.y + crosshairArm}
                    stroke={color}
                    strokeWidth={strokeScale}
                    opacity={0.6}
                    pointerEvents="none"
                  />

                  {/* Hollow ring — thicker when selected */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={ringR}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 * strokeScale : 1.5 * strokeScale}
                    style={{
                      filter: isSelected
                        ? `drop-shadow(0 0 ${3 * strokeScale}px ${color}88)`
                        : undefined,
                    }}
                    pointerEvents="none"
                  />
                  {/* White inner dot at exact corner pixel */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={strokeScale * 1.2}
                    fill="white"
                    stroke={color}
                    strokeWidth={strokeScale * 0.5}
                    pointerEvents="none"
                  />

                  {/* Label — offset away from corner so pixel stays visible */}
                  <text
                    x={pt.x + labelOff.dx * strokeScale}
                    y={pt.y + labelOff.dy * strokeScale}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={8 * strokeScale}
                    fontWeight={700}
                    fill={color}
                    stroke="white"
                    strokeWidth={2 * strokeScale}
                    paintOrder="stroke"
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
