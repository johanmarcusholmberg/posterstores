import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type MockupTemplate,
  type ManualSurfaceConfig,
  type MockupTemplateValidationResult,
  type AdminPosterSearchResult,
  type MockupPreviewResult,
  adminCreateMockupTemplate,
  adminUpdateMockupTemplate,
  requestMockupImageUploadUrl,
  uploadMockupImageFile,
  getStorageUrl,
  adminValidateMockupTemplate,
  adminValidateMockupTemplateDraft,
  adminPreviewMockupTemplate,
  adminSearchPosters,
} from "@/lib/mockupApi";
import { Upload, Loader2, CheckCircle2, Info, RotateCcw, Pencil, RefreshCw, ChevronDown, ChevronRight, XCircle, AlertTriangle, CheckCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import MockupSurfaceEditor, { type SurfaceCorners } from "./MockupSurfaceEditor";

const CATEGORIES = ["Wall", "Interior", "Café/Table", "Frame", "Lifestyle", "Minimal", "Decorative"];
const FRAME_MATERIALS = [
  { value: "none", label: "None" },
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "light-wood", label: "Light wood" },
  { value: "dark-wood", label: "Dark wood" },
  { value: "oak", label: "Oak" },
  { value: "mixed", label: "Mixed" },
];
const ORIENTATIONS = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
  { value: "square", label: "Square" },
  { value: "any", label: "Any" },
];
const FORMATS = ["30x40", "50x50", "50x70", "A4", "A3", "A2"];

interface FallbackPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getFallbackPlacement(orientation: string): FallbackPlacement {
  if (orientation === "landscape") return { x: 20, y: 25, width: 60, height: 45 };
  if (orientation === "square") return { x: 25, y: 20, width: 50, height: 50 };
  return { x: 30, y: 15, width: 40, height: 70 };
}

function generateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

interface PlacementError {
  x?: string;
  y?: string;
  width?: string;
  height?: string;
}

function validatePlacement(
  x: string,
  y: string,
  width: string,
  height: string
): PlacementError {
  const errors: PlacementError = {};
  const nx = parseFloat(x);
  const ny = parseFloat(y);
  const nw = parseFloat(width);
  const nh = parseFloat(height);

  if (x !== "" && (isNaN(nx) || nx < 0)) errors.x = "Must be ≥ 0";
  if (y !== "" && (isNaN(ny) || ny < 0)) errors.y = "Must be ≥ 0";
  if (width !== "" && (isNaN(nw) || nw <= 0)) errors.width = "Must be > 0";
  if (height !== "" && (isNaN(nh) || nh <= 0)) errors.height = "Must be > 0";

  if (!errors.x && !errors.width && x !== "" && width !== "") {
    if (nx + nw > 100) errors.x = `X (${nx}) + Width (${nw}) exceeds 100%`;
  }
  if (!errors.y && !errors.height && y !== "" && height !== "") {
    if (ny + nh > 100) errors.y = `Y (${ny}) + Height (${nh}) exceeds 100%`;
  }

  return errors;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctToPx(pct: string, dim: number | null): string {
  if (!dim || pct === "") return "";
  const p = parseFloat(pct);
  if (isNaN(p)) return "";
  return Math.round((p / 100) * dim).toString();
}

function pxToPct(px: string, dim: number | null): string {
  if (!dim || px === "") return "";
  const p = parseInt(px, 10);
  if (isNaN(p)) return "";
  return round2((p / dim) * 100).toString();
}

interface MockupTemplateFormProps {
  storeKey: string;
  template?: MockupTemplate;
  onSaved: (template: MockupTemplate) => void;
  onCancel: () => void;
}

export function MockupTemplateForm({
  storeKey,
  template,
  onSaved,
  onCancel,
}: MockupTemplateFormProps) {
  const { toast } = useToast();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [templateKey, setTemplateKey] = useState(template?.templateKey ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [frameType, setFrameType] = useState(template?.frameType ?? "none");
  const [orientation, setOrientation] = useState(template?.orientation ?? "portrait");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(template?.supportedFormats ?? []);
  const [isFeatured, setIsFeatured] = useState(template?.isFeatured ?? false);
  const [active, setActive] = useState(template?.active ?? true);
  const [sortOrder, setSortOrder] = useState(template?.sortOrder ?? 0);
  const [isGlobal, setIsGlobal] = useState(template ? template.storeKey === null : true);
  const [canBePrimary, setCanBePrimary] = useState(template?.canBePrimary ?? true);
  const [canBeHover, setCanBeHover] = useState(template?.canBeHover ?? false);
  const [canBeGallery, setCanBeGallery] = useState(template?.canBeGallery ?? true);

  const [backgroundImageUrl, setBackgroundImageUrl] = useState(
    template?.backgroundImageUrl ?? template?.previewThumbnailUrl ?? ""
  );
  const [storagePath, setStoragePath] = useState(template?.storagePath ?? "");
  const [uploadProgress, setUploadProgress] = useState<"idle" | "uploading" | "done">("idle");

  const [posterX, setPosterX] = useState<string>(template?.posterX?.toString() ?? "");
  const [posterY, setPosterY] = useState<string>(template?.posterY?.toString() ?? "");
  const [posterWidth, setPosterWidth] = useState<string>(template?.posterWidth?.toString() ?? "");
  const [posterHeight, setPosterHeight] = useState<string>(template?.posterHeight?.toString() ?? "");
  const [rotation, setRotation] = useState<string>(template?.rotation?.toString() ?? "0");
  const [borderRadius, setBorderRadius] = useState<string>(template?.borderRadius?.toString() ?? "0");
  const [fitMode, setFitMode] = useState<string>(template?.fitMode ?? "contain");
  const [brightness, setBrightness] = useState<string>((template?.brightness ?? 1.0).toString());
  const [contrast, setContrast] = useState<string>((template?.contrast ?? 1.0).toString());
  const [saturation, setSaturation] = useState<string>((template?.saturation ?? 1.0).toString());

  const [imgNaturalWidth, setImgNaturalWidth] = useState<number | null>(null);
  const [imgNaturalHeight, setImgNaturalHeight] = useState<number | null>(null);

  // Layered image state
  const [lightingOverlayUrl, setLightingOverlayUrl] = useState(template?.lightingOverlayUrl ?? "");
  const [foregroundImageUrl, setForegroundImageUrl] = useState(template?.foregroundImageUrl ?? "");
  const [defaultLightingBlendMode, setDefaultLightingBlendMode] = useState(
    template?.defaultLightingBlendMode ?? "multiply"
  );
  const [defaultLightingOpacity, setDefaultLightingOpacity] = useState(
    (template?.defaultLightingOpacity ?? 0.8).toString()
  );
  const [defaultForegroundOpacity, setDefaultForegroundOpacity] = useState(
    (template?.defaultForegroundOpacity ?? 1.0).toString()
  );
  const [showLayeredImages, setShowLayeredImages] = useState(false);
  const [lightingUploadProgress, setLightingUploadProgress] = useState<"idle" | "uploading" | "done">("idle");
  const [foregroundUploadProgress, setForegroundUploadProgress] = useState<"idle" | "uploading" | "done">("idle");
  const lightingFileInputRef = useRef<HTMLInputElement>(null);
  const foregroundFileInputRef = useRef<HTMLInputElement>(null);

  /** Admin-defined manual surface stored in placement_config column. */
  const [storedManualSurface, setStoredManualSurface] = useState<ManualSurfaceConfig | null>(
    template?.placementConfig ?? null
  );
  const [showSurfaceEditor, setShowSurfaceEditor] = useState(false);
  const [surfaceEditorSaving, setSurfaceEditorSaving] = useState(false);
  const [surfaceChanged, setSurfaceChanged] = useState(false);

  // Collapsible section state
  const [showPosterSurface, setShowPosterSurface] = useState(() => {
    if (!template) return true;
    const hasManual = !!(template.placementConfig as ManualSurfaceConfig | null | undefined)?.corners ||
      (template.posterX != null && template.posterY != null);
    return !hasManual;
  });
  const [showCompositing, setShowCompositing] = useState(false);

  const [saving, setSaving] = useState(false);

  // ── Phase 3: Validation & Preview state ────────────────────────────────────
  const [validationResult, setValidationResult] = useState<MockupTemplateValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);

  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [posterSearchQuery, setPosterSearchQuery] = useState("");
  const [posterSearchResults, setPosterSearchResults] = useState<AdminPosterSearchResult[]>([]);
  const [selectedPosterId, setSelectedPosterId] = useState<number | null>(null);
  const [previewResult, setPreviewResult] = useState<MockupPreviewResult | null>(null);
  const [generating, setGenerating] = useState(false);
  /** Set to true after a successful preview generation; cleared when any render-relevant value changes. */
  const [previewVerified, setPreviewVerified] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  /** Tracks whether the component has mounted — used to skip clearing effects on initial mount. */
  const hasMounted = useRef(false);

  type DragType = "move" | "nw" | "ne" | "sw" | "se";
  const dragState = useRef<{
    type: DragType;
    startMx: number;
    startMy: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const placementErrors = validatePlacement(posterX, posterY, posterWidth, posterHeight);
  const hasPlacementErrors = Object.keys(placementErrors).length > 0;
  const hasPosterArea = posterX !== "" && posterY !== "" && posterWidth !== "" && posterHeight !== "";

  useEffect(() => {
    if (!isEdit && name && !templateKey) {
      setTemplateKey(generateKey(name));
    }
  }, [name, isEdit]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImgNaturalWidth(img.naturalWidth);
      setImgNaturalHeight(img.naturalHeight);
    }
  }, []);

  const handlePxChange = useCallback(
    (
      value: string,
      dim: number | null,
      setPct: (v: string) => void,
    ) => {
      if (!dim) return;
      const pct = pxToPct(value, dim);
      setPct(pct);
    },
    []
  );

  const startDrag = useCallback(
    (e: React.MouseEvent, type: "move" | "nw" | "ne" | "sw" | "se") => {
      e.preventDefault();
      e.stopPropagation();
      dragState.current = {
        type,
        startMx: e.clientX,
        startMy: e.clientY,
        startX: parseFloat(posterX) || 0,
        startY: parseFloat(posterY) || 0,
        startW: parseFloat(posterWidth) || 0,
        startH: parseFloat(posterHeight) || 0,
      };
      overlayRef.current?.focus();
    },
    [posterX, posterY, posterWidth, posterHeight]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = ((e.clientX - ds.startMx) / rect.width) * 100;
      const dy = ((e.clientY - ds.startMy) / rect.height) * 100;

      let nx = ds.startX;
      let ny = ds.startY;
      let nw = ds.startW;
      let nh = ds.startH;

      if (ds.type === "move") {
        nx = clamp(ds.startX + dx, 0, 100 - ds.startW);
        ny = clamp(ds.startY + dy, 0, 100 - ds.startH);
      } else if (ds.type === "se") {
        nw = clamp(ds.startW + dx, 1, 100 - ds.startX);
        nh = clamp(ds.startH + dy, 1, 100 - ds.startY);
      } else if (ds.type === "sw") {
        const right = ds.startX + ds.startW;
        nw = clamp(ds.startW - dx, 1, right);
        nx = right - nw;
        nh = clamp(ds.startH + dy, 1, 100 - ds.startY);
      } else if (ds.type === "ne") {
        nw = clamp(ds.startW + dx, 1, 100 - ds.startX);
        const bottom = ds.startY + ds.startH;
        nh = clamp(ds.startH - dy, 1, bottom);
        ny = bottom - nh;
      } else if (ds.type === "nw") {
        const right = ds.startX + ds.startW;
        const bottom = ds.startY + ds.startH;
        nw = clamp(ds.startW - dx, 1, right);
        nh = clamp(ds.startH - dy, 1, bottom);
        nx = right - nw;
        ny = bottom - nh;
      }

      setPosterX(round2(nx).toString());
      setPosterY(round2(ny).toString());
      setPosterWidth(round2(nw).toString());
      setPosterHeight(round2(nh).toString());
    };

    const onMouseUp = () => {
      dragState.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleOverlayKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (!arrows.includes(e.key)) return;
      e.preventDefault();

      const w = imgNaturalWidth;
      const h = imgNaturalHeight;
      let stepX: number;
      let stepY: number;

      if (e.altKey) {
        stepX = 0.1;
        stepY = 0.1;
      } else if (e.shiftKey) {
        stepX = w ? round2((10 / w) * 100) : 1;
        stepY = h ? round2((10 / h) * 100) : 1;
      } else {
        stepX = w ? round2((1 / w) * 100) : 0.1;
        stepY = h ? round2((1 / h) * 100) : 0.1;
      }

      const cx = parseFloat(posterX) || 0;
      const cy = parseFloat(posterY) || 0;
      const cw = parseFloat(posterWidth) || 0;
      const ch = parseFloat(posterHeight) || 0;

      let nx = cx;
      let ny = cy;
      if (e.key === "ArrowLeft") nx = clamp(cx - stepX, 0, 100 - cw);
      if (e.key === "ArrowRight") nx = clamp(cx + stepX, 0, 100 - cw);
      if (e.key === "ArrowUp") ny = clamp(cy - stepY, 0, 100 - ch);
      if (e.key === "ArrowDown") ny = clamp(cy + stepY, 0, 100 - ch);

      setPosterX(round2(nx).toString());
      setPosterY(round2(ny).toString());
    },
    [posterX, posterY, posterWidth, posterHeight, imgNaturalWidth, imgNaturalHeight]
  );

  const toggleFormat = (fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const applyFallbackPlacement = useCallback(
    (orient: string) => {
      const fb = getFallbackPlacement(orient);
      setPosterX(fb.x.toString());
      setPosterY(fb.y.toString());
      setPosterWidth(fb.width.toString());
      setPosterHeight(fb.height.toString());
      setRotation("0");
    },
    []
  );

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Only JPG, PNG, and WebP are allowed." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Max file size is 10MB." });
      return;
    }

    setUploadProgress("uploading");
    try {
      const { uploadURL, objectPath } = await requestMockupImageUploadUrl({
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      await uploadMockupImageFile(uploadURL, file);
      const servingUrl = getStorageUrl(objectPath);
      setStoragePath(objectPath);
      setBackgroundImageUrl(servingUrl);
      setUploadProgress("done");
      toast({ title: "Image uploaded" });
    } catch (e: unknown) {
      setUploadProgress("idle");
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    }
  };

  const handleLayerFileUpload = async (
    file: File,
    setUrl: (u: string) => void,
    setProgress: (s: "idle" | "uploading" | "done") => void
  ) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Only JPG, PNG, and WebP are allowed." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Max file size is 10MB." });
      return;
    }
    setProgress("uploading");
    try {
      const { uploadURL, objectPath } = await requestMockupImageUploadUrl({
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      await uploadMockupImageFile(uploadURL, file);
      const servingUrl = getStorageUrl(objectPath);
      setUrl(servingUrl);
      setProgress("done");
      toast({ title: "Layer image uploaded" });
    } catch (e: unknown) {
      setProgress("idle");
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    }
  };

  const handleUrlChange = (url: string) => {
    setStoragePath("");
    setBackgroundImageUrl(url);
  };

  const handleSaveSurface = async (corners: SurfaceCorners) => {
    if (!template?.id) return;
    setSurfaceEditorSaving(true);
    try {
      const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
      const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];
      const bbX = Math.min(...xs);
      const bbY = Math.min(...ys);
      const bbW = Math.max(...xs) - bbX;
      const bbH = Math.max(...ys) - bbY;

      const manualConfig: ManualSurfaceConfig = {
        mode: "corners",
        coordinateSystem: "normalized",
        source: "manual",
        corners,
        boundingBox: { x: bbX, y: bbY, width: bbW, height: bbH },
        fitMode: fitMode || "cover",
      };

      await adminUpdateMockupTemplate(template.id, {
        placementConfig: manualConfig,
      });

      setStoredManualSurface(manualConfig);
      setShowSurfaceEditor(false);
      setSurfaceChanged(true);
      toast({ title: "Surface saved", description: "Run Sync mockups to regenerate public images." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast({ variant: "destructive", title: "Failed to save surface", description: msg });
    } finally {
      setSurfaceEditorSaving(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    if (!templateKey.trim()) {
      toast({ variant: "destructive", title: "Template key is required" });
      return;
    }
    if (hasPlacementErrors) {
      toast({ variant: "destructive", title: "Fix placement errors before saving" });
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<MockupTemplate> = {
        name: name.trim(),
        templateKey: templateKey.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        frameType,
        orientation,
        supportedFormats: selectedFormats.length > 0 ? selectedFormats : undefined,
        isFeatured,
        active,
        sortOrder,
        canBePrimary,
        canBeHover,
        canBeGallery,
        storeKey: isGlobal ? null : storeKey,
        backgroundImageUrl: backgroundImageUrl || undefined,
        storagePath: storagePath || undefined,
        previewThumbnailUrl: backgroundImageUrl || undefined,
        posterX: posterX !== "" ? parseFloat(posterX) : undefined,
        posterY: posterY !== "" ? parseFloat(posterY) : undefined,
        posterWidth: posterWidth !== "" ? parseFloat(posterWidth) : undefined,
        posterHeight: posterHeight !== "" ? parseFloat(posterHeight) : undefined,
        rotation: rotation !== "" ? parseFloat(rotation) : undefined,
        borderRadius: borderRadius !== "" ? parseFloat(borderRadius) : undefined,
        fitMode,
        brightness: brightness !== "" ? parseFloat(brightness) : undefined,
        contrast: contrast !== "" ? parseFloat(contrast) : undefined,
        saturation: saturation !== "" ? parseFloat(saturation) : undefined,
        // Layered images — use null (not undefined) when cleared so the API
        // receives an explicit "set to null" rather than omitting the field.
        // undefined values are stripped by JSON.stringify and the PUT handler
        // skips fields it doesn't see, leaving the old value in the database.
        lightingOverlayUrl: lightingOverlayUrl || null,
        foregroundImageUrl: foregroundImageUrl || null,
        defaultLightingBlendMode,
        defaultLightingOpacity: defaultLightingOpacity !== "" ? parseFloat(defaultLightingOpacity) : undefined,
        defaultForegroundOpacity: defaultForegroundOpacity !== "" ? parseFloat(defaultForegroundOpacity) : undefined,
      };

      let saved: MockupTemplate;
      if (isEdit && template) {
        saved = await adminUpdateMockupTemplate(template.id, payload);
      } else {
        saved = await adminCreateMockupTemplate(payload);
      }

      toast({ title: isEdit ? "Template updated" : "Template created" });
      onSaved(saved);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast({ variant: "destructive", title: "Save failed", description: msg });
    } finally {
      setSaving(false);
    }
  };

  // ── Phase 3: Validation & Preview handlers ─────────────────────────────────

  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      let result: MockupTemplateValidationResult;
      if (isEdit && template) {
        result = await adminValidateMockupTemplate(template.id);
      } else {
        result = await adminValidateMockupTemplateDraft({
          backgroundImageUrl: backgroundImageUrl || null,
          lightingOverlayUrl: lightingOverlayUrl || null,
          foregroundImageUrl: foregroundImageUrl || null,
          posterX: posterX ? parseFloat(posterX) : null,
          posterY: posterY ? parseFloat(posterY) : null,
          posterWidth: posterWidth ? parseFloat(posterWidth) : null,
          posterHeight: posterHeight ? parseFloat(posterHeight) : null,
          rotation: rotation ? parseFloat(rotation) : null,
          fitMode: fitMode || null,
          placementConfig: storedManualSurface,
        } as Partial<MockupTemplate>);
      }
      setValidationResult(result);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Validation failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setValidating(false);
    }
  }, [isEdit, template, backgroundImageUrl, lightingOverlayUrl, foregroundImageUrl, posterX, posterY, posterWidth, posterHeight, rotation, fitMode, storedManualSurface, toast]);

  const handlePosterSearch = useCallback(async (q: string) => {
    try {
      const results = await adminSearchPosters(storeKey, q, 12);
      setPosterSearchResults(results);
    } catch { /* silent — search is best-effort */ }
  }, [storeKey]);

  const handleGeneratePreview = useCallback(async () => {
    if (!selectedPosterId || !isEdit || !template) return;
    setGenerating(true);
    try {
      const result = await adminPreviewMockupTemplate(template.id, selectedPosterId);
      setPreviewResult(result);
      // Mark preview as verified for this exact render configuration.
      // Any subsequent change to a render-relevant field clears this.
      setPreviewVerified(true);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Preview failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setGenerating(false);
    }
  }, [selectedPosterId, isEdit, template, toast]);

  // ── Clear preview verification when any render-relevant value changes ─────────
  // Skip the initial mount so the badge doesn't flip on load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    setPreviewVerified(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImageUrl, posterX, posterY, posterWidth, posterHeight,
      storedManualSurface, fitMode, brightness, contrast, saturation,
      lightingOverlayUrl, defaultLightingBlendMode, defaultLightingOpacity,
      foregroundImageUrl, defaultForegroundOpacity, selectedPosterId]);

  // ── Clear selected preview poster when template store assignment changes ──────
  // When storeKey changes (global ↔ store-specific), the previously selected
  // poster may no longer be compatible with the template's new scope.
  useEffect(() => {
    setSelectedPosterId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobal]);

  const displayImageUrl = backgroundImageUrl || template?.previewThumbnailUrl || "";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column — metadata */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mt-name">Name *</Label>
            <Input
              id="mt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. White wall with black frame"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-key">Template key *</Label>
            <Input
              id="mt-key"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              placeholder="e.g. white-wall-black-frame"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Unique identifier, lowercase with hyphens</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-description">Description / internal note</Label>
            <Textarea
              id="mt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Internal note about this mockup template"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frame material</Label>
              <Select value={frameType} onValueChange={setFrameType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAME_MATERIALS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Orientation</Label>
            <Select value={orientation} onValueChange={setOrientation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIENTATIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Supported poster formats</Label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => toggleFormat(fmt)}
                  className={cn(
                    "px-2.5 py-1 rounded border text-xs font-medium transition-colors",
                    selectedFormats.includes(fmt)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {fmt}
                </button>
              ))}
            </div>
            {selectedFormats.length === 0 && (
              <p className="text-xs text-muted-foreground">No format selected = compatible with all</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Featured</p>
              <p className="text-xs text-muted-foreground">Show as a highlighted template</p>
            </div>
            <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Visible in poster mockup selection</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Global template</p>
              <p className="text-xs text-muted-foreground">Available to all stores</p>
            </div>
            <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
          </div>

          {/* Intended use flags */}
          <div className="rounded-md border px-3 py-2.5 space-y-2">
            <p className="text-sm font-medium">Intended use (for sync)</p>
            <p className="text-xs text-muted-foreground -mt-1">
              Controls how generated mockups are assigned during bulk sync.
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Can be primary</p>
                <p className="text-xs text-muted-foreground">Use as the main product image if none exists</p>
              </div>
              <Switch checked={canBePrimary} onCheckedChange={setCanBePrimary} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Can be hover</p>
                <p className="text-xs text-muted-foreground">Use as the hover image in shop listings</p>
              </div>
              <Switch checked={canBeHover} onCheckedChange={setCanBeHover} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Can be gallery</p>
                <p className="text-xs text-muted-foreground">Include in the product detail gallery</p>
              </div>
              <Switch checked={canBeGallery} onCheckedChange={setCanBeGallery} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Sort order</Label>
            <p className="text-xs text-muted-foreground">
              Template order is managed in the mockup template list using the Up / Down buttons.
            </p>
            <div className="text-sm text-muted-foreground font-mono border rounded px-2.5 py-1.5 bg-muted/40 w-24 select-none">
              #{sortOrder}
            </div>
          </div>
        </div>

        {/* Right column — image + placement */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Base image</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The scene, wall, or room. The poster is composited in when you run Sync mockups.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProgress === "uploading"}
              >
                {uploadProgress === "uploading" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {displayImageUrl ? "Replace template image" : "Upload template image"}
              </Button>
            </div>
            <div
              ref={containerRef}
              className={cn(
                "relative rounded-lg border-2 border-dashed transition-colors overflow-hidden",
                "border-border hover:border-primary/50",
                displayImageUrl ? "aspect-[3/4]" : "aspect-[3/4] flex flex-col items-center justify-center bg-muted/30"
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-overlay]")) return;
                fileInputRef.current?.click();
              }}
              style={{ cursor: "pointer" }}
            >
              {displayImageUrl ? (
                <>
                  <img
                    src={displayImageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onLoad={handleImageLoad}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {hasPosterArea && (
                    <div
                      ref={overlayRef}
                      data-overlay
                      tabIndex={0}
                      className="absolute border-2 border-white bg-white/15 focus:outline-none focus:ring-2 focus:ring-primary"
                      style={{
                        left: `${posterX}%`,
                        top: `${posterY}%`,
                        width: `${posterWidth}%`,
                        height: `${posterHeight}%`,
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
                        cursor: "move",
                        transform: rotation && parseFloat(rotation) !== 0 ? `rotate(${rotation}deg)` : undefined,
                        borderRadius: borderRadius && parseFloat(borderRadius) > 0 ? `${borderRadius}px` : undefined,
                      }}
                      onMouseDown={(e) => startDrag(e, "move")}
                      onKeyDown={handleOverlayKeyDown}
                    >
                      {/* Corner resize handles */}
                      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <div
                          key={corner}
                          className="absolute w-3 h-3 bg-white border border-black/50 rounded-sm z-10"
                          style={{
                            top: corner.startsWith("n") ? -6 : undefined,
                            bottom: corner.startsWith("s") ? -6 : undefined,
                            left: corner.endsWith("w") ? -6 : undefined,
                            right: corner.endsWith("e") ? -6 : undefined,
                            cursor: `${corner}-resize`,
                          }}
                          onMouseDown={(e) => { e.stopPropagation(); startDrag(e, corner); }}
                        />
                      ))}
                      {/* Live label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                        <span className="text-white text-xs font-semibold drop-shadow bg-black/60 px-1.5 py-0.5 rounded">
                          Surface preview
                        </span>
                        <span className="text-white/80 text-[9px] drop-shadow bg-black/50 px-1 py-0.5 rounded font-mono leading-tight text-center">
                          {imgNaturalWidth && imgNaturalHeight ? (
                            <>
                              x {pctToPx(posterX, imgNaturalWidth)}px/{posterX}%{" "}
                              y {pctToPx(posterY, imgNaturalHeight)}px/{posterY}%<br />
                              w {pctToPx(posterWidth, imgNaturalWidth)}px/{posterWidth}%{" "}
                              h {pctToPx(posterHeight, imgNaturalHeight)}px/{posterHeight}%
                            </>
                          ) : (
                            <>{posterX}%, {posterY}% · {posterWidth}×{posterHeight}</>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
                    <div className="bg-white/90 rounded-md px-3 py-1.5 text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      Replace image
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-6">
                  {uploadProgress === "uploading" ? (
                    <Loader2 className="w-8 h-8 mx-auto mb-2 text-primary animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {uploadProgress === "uploading" ? "Uploading..." : "Click to upload base image"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, WebP • Max 10MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
            <div className="space-y-1.5">
              <Label htmlFor="mt-img-url" className="text-xs">Or paste image URL</Label>
              <Input
                id="mt-img-url"
                value={backgroundImageUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://..."
                className="text-xs h-8"
              />
            </div>
          </div>

          {/* Poster surface section */}
          <div className="space-y-0 rounded-md border overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              onClick={() => setShowPosterSurface((v) => !v)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">Poster surface</p>
                {storedManualSurface?.mode === "corners" ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700">Corner surface active</span>
                ) : hasPosterArea ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Bounding box active</span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700">No surface</span>
                )}
                {surfaceChanged && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700">Sync required</span>
                )}
              </div>
              {showPosterSurface ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>
            {showPosterSurface && (
              <div className="space-y-3 px-4 pb-4 pt-1 border-t">
                <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Position the four corners around the area where the poster should appear.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {backgroundImageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => applyFallbackPlacement(orientation)}
                        title="Apply safe default values based on orientation"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Apply defaults
                      </Button>
                    )}
                    {isEdit && backgroundImageUrl && (
                      <Button
                        type="button"
                        variant={showSurfaceEditor ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setShowSurfaceEditor((v) => !v)}
                        title="Open the 4-corner surface editor for perspective-correct compositing"
                      >
                        <Pencil className="w-3 h-3" />
                        {showSurfaceEditor ? "Close editor" : "Edit corners"}
                      </Button>
                    )}
                  </div>
                </div>

                {surfaceChanged && (
                  <div className="flex items-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <p className="text-xs text-indigo-700 dark:text-indigo-400">
                      Surface saved — run <strong>Sync mockups</strong> to regenerate public images.
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Percentage values (0–100) for the bounding box, or use <strong>Edit corners</strong> for a 4-corner perspective surface.
                  Define the poster surface before running Sync mockups.
                </p>

                {/* Header row */}
                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 items-end">
                  <div className="text-[10px] text-muted-foreground font-medium pb-1 pr-1" />
                  <div className="text-[10px] text-muted-foreground font-medium text-center">Left / X</div>
                  <div className="text-[10px] text-muted-foreground font-medium text-center">Top / Y</div>

                  <div className="text-[10px] text-muted-foreground self-center">%</div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      value={posterX}
                      onChange={(e) => setPosterX(e.target.value)}
                      placeholder="e.g. 20"
                      className={cn("h-8 text-sm", placementErrors.x && "border-destructive")}
                      min={0} max={100}
                    />
                    {placementErrors.x && <p className="text-[11px] text-destructive">{placementErrors.x}</p>}
                  </div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      value={posterY}
                      onChange={(e) => setPosterY(e.target.value)}
                      placeholder="e.g. 15"
                      className={cn("h-8 text-sm", placementErrors.y && "border-destructive")}
                      min={0} max={100}
                    />
                    {placementErrors.y && <p className="text-[11px] text-destructive">{placementErrors.y}</p>}
                  </div>

                  <div className="text-[10px] text-muted-foreground self-center">px</div>
                  <Input
                    type="number"
                    value={pctToPx(posterX, imgNaturalWidth)}
                    onChange={(e) => handlePxChange(e.target.value, imgNaturalWidth, setPosterX)}
                    placeholder={imgNaturalWidth ? "—" : "load image"}
                    disabled={!imgNaturalWidth}
                    className="h-8 text-sm"
                    min={0}
                  />
                  <Input
                    type="number"
                    value={pctToPx(posterY, imgNaturalHeight)}
                    onChange={(e) => handlePxChange(e.target.value, imgNaturalHeight, setPosterY)}
                    placeholder={imgNaturalHeight ? "—" : "load image"}
                    disabled={!imgNaturalHeight}
                    className="h-8 text-sm"
                    min={0}
                  />
                </div>

                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 items-end mt-1">
                  <div className="text-[10px] text-muted-foreground font-medium pb-1 pr-1" />
                  <div className="text-[10px] text-muted-foreground font-medium text-center">Width</div>
                  <div className="text-[10px] text-muted-foreground font-medium text-center">Height</div>

                  <div className="text-[10px] text-muted-foreground self-center">%</div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      value={posterWidth}
                      onChange={(e) => setPosterWidth(e.target.value)}
                      placeholder="e.g. 60"
                      className={cn("h-8 text-sm", placementErrors.width && "border-destructive")}
                      min={1} max={100}
                    />
                    {placementErrors.width && <p className="text-[11px] text-destructive">{placementErrors.width}</p>}
                  </div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      value={posterHeight}
                      onChange={(e) => setPosterHeight(e.target.value)}
                      placeholder="e.g. 70"
                      className={cn("h-8 text-sm", placementErrors.height && "border-destructive")}
                      min={1} max={100}
                    />
                    {placementErrors.height && <p className="text-[11px] text-destructive">{placementErrors.height}</p>}
                  </div>

                  <div className="text-[10px] text-muted-foreground self-center">px</div>
                  <Input
                    type="number"
                    value={pctToPx(posterWidth, imgNaturalWidth)}
                    onChange={(e) => handlePxChange(e.target.value, imgNaturalWidth, setPosterWidth)}
                    placeholder={imgNaturalWidth ? "—" : "load image"}
                    disabled={!imgNaturalWidth}
                    className="h-8 text-sm"
                    min={1}
                  />
                  <Input
                    type="number"
                    value={pctToPx(posterHeight, imgNaturalHeight)}
                    onChange={(e) => handlePxChange(e.target.value, imgNaturalHeight, setPosterHeight)}
                    placeholder={imgNaturalHeight ? "—" : "load image"}
                    disabled={!imgNaturalHeight}
                    className="h-8 text-sm"
                    min={1}
                  />
                </div>

                <p className="text-[11px] text-muted-foreground flex items-start gap-1 mt-1">
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  Percent values are used for responsive rendering. Pixel values are calculated from the original mockup image size for precision.
                  {imgNaturalWidth && imgNaturalHeight ? (
                    <span className="text-muted-foreground/70 ml-auto shrink-0">
                      {imgNaturalWidth}×{imgNaturalHeight}px
                    </span>
                  ) : null}
                </p>

                <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  Drag the overlay to move · drag corners to resize · arrow keys to nudge (Shift = 10px, Alt = 0.1%)
                </p>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="space-y-1">
                    <Label className="text-xs">Rotation (°)</Label>
                    <Input
                      type="number"
                      value={rotation}
                      onChange={(e) => setRotation(e.target.value)}
                      placeholder="0"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Border radius (px)</Label>
                    <Input
                      type="number"
                      value={borderRadius}
                      onChange={(e) => setBorderRadius(e.target.value)}
                      placeholder="0"
                      className="h-8 text-sm"
                      min={0}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4-corner surface editor panel */}
          {showSurfaceEditor && backgroundImageUrl && (
            <div className="space-y-3 rounded-md border border-indigo-300 bg-indigo-50/30 dark:bg-indigo-950/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">Precision surface editor</p>
                  <p className="text-xs text-indigo-700/70 dark:text-indigo-400/70 mt-0.5">
                    Drag handles to position the four corners of the poster area. Save to enable perspective-correct compositing.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowSurfaceEditor(false)}
                >
                  Close
                </Button>
              </div>
              <MockupSurfaceEditor
                backgroundImageUrl={backgroundImageUrl}
                imageWidth={imgNaturalWidth}
                imageHeight={imgNaturalHeight}
                initialCorners={
                  storedManualSurface?.mode === "corners" && storedManualSurface.corners
                    ? (storedManualSurface.corners as SurfaceCorners)
                    : null
                }
                detectedCorners={null}
                onSave={handleSaveSurface}
                onCancel={() => setShowSurfaceEditor(false)}
                saving={surfaceEditorSaving}
              />
            </div>
          )}

          {/* Poster appearance section */}
          <div className="space-y-0 rounded-md border overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              onClick={() => setShowCompositing((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Poster appearance</p>
                {(brightness !== "1" || contrast !== "1" || saturation !== "1") ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700">Custom settings</span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Neutral</span>
                )}
              </div>
              {showCompositing ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>
            {showCompositing && (
              <div className="space-y-3 px-4 pb-4 pt-1 border-t">
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">Adjustments applied to the inserted poster only during Sync. Does not affect the background or overlay layers.</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0 ml-2"
                    onClick={() => {
                      setFitMode("contain");
                      setBrightness("1");
                      setContrast("1");
                      setSaturation("1");
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to neutral
                  </Button>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  Applied when mockups are synced/rendered. Run Sync mockups after changing these settings.
                </p>

                <div className="space-y-1">
                  <Label className="text-xs">Fit mode</Label>
                  <p className="text-[10px] text-muted-foreground">How the poster fills the selected surface.</p>
                  <Select value={fitMode} onValueChange={setFitMode}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">Cover (fill area, crop if needed)</SelectItem>
                      <SelectItem value="contain">Contain (show full poster)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Brightness</Label>
                    <Input type="number" value={brightness} onChange={(e) => setBrightness(e.target.value)} className="h-7 text-xs" min={0.5} max={1.5} step={0.01} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Contrast</Label>
                    <Input type="number" value={contrast} onChange={(e) => setContrast(e.target.value)} className="h-7 text-xs" min={0.5} max={1.5} step={0.01} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Saturation</Label>
                    <Input type="number" value={saturation} onChange={(e) => setSaturation(e.target.value)} className="h-7 text-xs" min={0} max={2} step={0.01} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Layered images section */}
      <div className="rounded-md border overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          onClick={() => setShowLayeredImages((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Overlay layers</p>
            {(lightingOverlayUrl || foregroundImageUrl) ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-700">
                {[lightingOverlayUrl && "Effects", foregroundImageUrl && "Foreground"].filter(Boolean).join(" + ")} configured
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">None configured</span>
            )}
          </div>
          {showLayeredImages ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>
        {showLayeredImages && (
          <div className="space-y-5 px-4 pb-4 pt-1 border-t">
            <p className="text-xs text-muted-foreground mt-2">
              Layered images are composited on top of the poster after it is inserted into the background.
              They enable lighting effects, glass reflections, shadows, and physical foreground elements.
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              Applied during Sync mockups. Run Sync after changing these images.
            </p>

            {/* Effects overlay */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Effects overlay</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Transparent full-size layer placed above the poster for shadows, reflections, glare, or lighting. Use PNG with transparency.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={lightingOverlayUrl}
                  onChange={(e) => setLightingOverlayUrl(e.target.value)}
                  placeholder="https://… or upload below"
                  className="text-xs h-8 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  onClick={() => lightingFileInputRef.current?.click()}
                  disabled={lightingUploadProgress === "uploading"}
                >
                  {lightingUploadProgress === "uploading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Upload
                </Button>
                {lightingOverlayUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setLightingOverlayUrl("")}>
                    Clear
                  </Button>
                )}
              </div>
              <input ref={lightingFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLayerFileUpload(f, setLightingOverlayUrl, setLightingUploadProgress); e.target.value = ""; }} />
              {lightingOverlayUrl && (
                <div className="w-24 h-24 rounded border overflow-hidden bg-checkerboard">
                  <img src={lightingOverlayUrl} alt="Effects overlay preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Blend mode</Label>
                  <Select value={defaultLightingBlendMode} onValueChange={setDefaultLightingBlendMode}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiply">Multiply (shadows, darkening)</SelectItem>
                      <SelectItem value="screen">Screen (highlights, brightening)</SelectItem>
                      <SelectItem value="overlay">Overlay (contrast boost)</SelectItem>
                      <SelectItem value="soft-light">Soft light (gentle)</SelectItem>
                      <SelectItem value="over">Over (opaque composite)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Default opacity (0–1)</Label>
                  <Input type="number" value={defaultLightingOpacity} onChange={(e) => setDefaultLightingOpacity(e.target.value)} className="h-8 text-xs" min={0} max={1} step={0.05} />
                </div>
              </div>
            </div>

            {/* Foreground image */}
            <div className="space-y-3 pt-3 border-t">
              <div>
                <Label className="text-sm font-medium">Foreground image</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Composited on top of everything using normal "over" blend. Use PNG with transparency for physical elements in front of the poster (e.g. a table edge, a vase).
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={foregroundImageUrl}
                  onChange={(e) => setForegroundImageUrl(e.target.value)}
                  placeholder="https://… or upload below"
                  className="text-xs h-8 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  onClick={() => foregroundFileInputRef.current?.click()}
                  disabled={foregroundUploadProgress === "uploading"}
                >
                  {foregroundUploadProgress === "uploading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Upload
                </Button>
                {foregroundImageUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setForegroundImageUrl("")}>
                    Clear
                  </Button>
                )}
              </div>
              <input ref={foregroundFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLayerFileUpload(f, setForegroundImageUrl, setForegroundUploadProgress); e.target.value = ""; }} />
              {foregroundImageUrl && (
                <div className="w-24 h-24 rounded border overflow-hidden bg-checkerboard">
                  <img src={foregroundImageUrl} alt="Foreground preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="space-y-1 max-w-xs">
                <Label className="text-xs">Default opacity (0–1)</Label>
                <Input type="number" value={defaultForegroundOpacity} onChange={(e) => setDefaultForegroundOpacity(e.target.value)} className="h-8 text-xs" min={0} max={1} step={0.05} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Template readiness ─────────────────────────────────────────────── */}
      {(() => {
        const hasErrors = validationResult && !validationResult.valid;
        const readinessBadge = !validationResult
          ? <span className="ml-auto mr-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Draft</span>
          : hasErrors
          ? <span className="ml-auto mr-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">Needs attention</span>
          : previewVerified
          ? <span className="ml-auto mr-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium">Preview verified</span>
          : <span className="ml-auto mr-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 font-medium">Technically valid</span>;
        return (
          <div className="border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowReadiness(!showReadiness)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              {!validationResult ? <Info className="w-4 h-4 text-muted-foreground shrink-0" /> :
               hasErrors ? <XCircle className="w-4 h-4 text-destructive shrink-0" /> :
               <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
              Template readiness
              {readinessBadge}
              {showReadiness ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showReadiness && (
              <div className="p-4 space-y-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={validating}
                  className="gap-1.5 text-xs h-8"
                >
                  {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {validationResult ? "Re-validate template" : "Validate template"}
                </Button>

                {validationResult && (
                  <div className="space-y-3 text-xs">
                    {validationResult.issues.length === 0 ? (
                      <p className="text-muted-foreground">No issues found.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {validationResult.issues.map((issue, i) => (
                          <div
                            key={i}
                            className={cn("flex gap-2 p-2 rounded",
                              issue.severity === "error"
                                ? "bg-destructive/10 text-destructive"
                                : issue.severity === "warning"
                                ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
                                : "bg-accent text-muted-foreground"
                            )}
                          >
                            {issue.severity === "error" ? <XCircle className="w-3 h-3 shrink-0 mt-0.5" /> :
                             issue.severity === "warning" ? <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> :
                             <Info className="w-3 h-3 shrink-0 mt-0.5" />}
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Image metadata */}
                    <div className="grid grid-cols-1 gap-2 pt-1 border-t">
                      {validationResult.images.base && (
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">Base image</p>
                          <p className="text-muted-foreground">{validationResult.images.base.width}×{validationResult.images.base.height} px · {validationResult.images.base.format?.toUpperCase()} · {validationResult.images.base.hasAlpha ? "has alpha" : "no alpha"}</p>
                        </div>
                      )}
                      {validationResult.images.effects && (
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">Effects overlay</p>
                          <p className="text-muted-foreground">{validationResult.images.effects.width}×{validationResult.images.effects.height} px · {validationResult.images.effects.format?.toUpperCase()} · {validationResult.images.effects.hasAlpha ? "has alpha" : "no alpha"}{validationResult.images.effects.isOpaque ? " (fully opaque)" : ""}</p>
                        </div>
                      )}
                      {validationResult.images.foreground && (
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">Foreground</p>
                          <p className="text-muted-foreground">{validationResult.images.foreground.width}×{validationResult.images.foreground.height} px · {validationResult.images.foreground.format?.toUpperCase()} · {validationResult.images.foreground.hasAlpha ? "has alpha" : "no alpha"}{validationResult.images.foreground.isOpaque ? " (fully opaque ⚠)" : ""}</p>
                        </div>
                      )}
                      {validationResult.surface.source && validationResult.surface.source !== "fallback" && (
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">Poster surface</p>
                          <p className="text-muted-foreground">Source: {validationResult.surface.source} · Mode: {validationResult.surface.geometryMode}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Exact preview ──────────────────────────────────────────────────── */}
      <div className="border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPreviewPanel(!showPreviewPanel)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
        >
          <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
          Exact preview
          {previewResult && <span className="ml-auto mr-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Generated</span>}
          {showPreviewPanel ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showPreviewPanel && (
          <div className="p-4 space-y-4 border-t">
            {!isEdit ? (
              <p className="text-xs text-muted-foreground">Save the template first to enable server-rendered previews.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">Select a test poster</Label>
                  <div className="flex gap-2">
                    <Input
                      value={posterSearchQuery}
                      onChange={(e) => {
                        setPosterSearchQuery(e.target.value);
                        handlePosterSearch(e.target.value);
                      }}
                      onFocus={() => { if (posterSearchResults.length === 0) handlePosterSearch(""); }}
                      placeholder="Search by poster title…"
                      className="h-8 text-xs"
                    />
                  </div>
                  {posterSearchResults.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto">
                      {posterSearchResults.map((poster) => (
                        <button
                          key={poster.id}
                          type="button"
                          onClick={() => setSelectedPosterId(poster.id)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-1.5 rounded border text-center transition-colors",
                            selectedPosterId === poster.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-muted-foreground"
                          )}
                        >
                          <div className="w-full aspect-[3/4] bg-muted rounded overflow-hidden">
                            {(poster.previewImageUrl || poster.imageUrl) && (
                              <img
                                src={poster.previewImageUrl || poster.imageUrl || ""}
                                alt={poster.title || ""}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <span className="text-[10px] leading-tight line-clamp-2 w-full">{poster.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePreview}
                    disabled={generating || !selectedPosterId || (validationResult != null && !validationResult.previewable)}
                    className="gap-1.5 text-xs h-8"
                  >
                    {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                    Generate preview
                  </Button>
                  {!selectedPosterId && (
                    <p className="text-xs text-muted-foreground">Select a poster above first.</p>
                  )}
                  {validationResult && !validationResult.previewable && (
                    <p className="text-xs text-destructive">Fix validation errors before generating a preview.</p>
                  )}
                </div>

                {previewResult && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Server-rendered JPEG · {previewResult.width}×{previewResult.height} px
                    </p>
                    <img
                      src={previewResult.previewUrl}
                      alt="Template preview"
                      className="max-w-full rounded border shadow-sm"
                      style={{ maxHeight: "480px", objectFit: "contain" }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || uploadProgress === "uploading" || hasPlacementErrors}
          className="gap-1.5"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? "Save changes" : "Create template"}
        </Button>
      </div>
    </div>
  );
}
