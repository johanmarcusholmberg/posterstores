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
  adminCreateMockupTemplate,
  adminUpdateMockupTemplate,
  requestMockupImageUploadUrl,
  uploadMockupImageFile,
  getStorageUrl,
  analyzeMockupPlacement,
} from "@/lib/mockupApi";
import { Upload, Loader2, Sparkles, CheckCircle2, AlertCircle, Info, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

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

type AnalysisState = "idle" | "analyzing" | "detected" | "fallback" | "not-detected" | "error";

interface DetectedValues {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
  description: string;
  model: string;
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

function getConfidenceBadge(confidence: number): {
  label: string;
  className: string;
} {
  const pct = Math.round(confidence * 100);
  if (pct >= 80) {
    return {
      label: `Detected (${pct}% confidence)`,
      className: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700",
    };
  }
  if (pct >= 50) {
    return {
      label: `Check placement (${pct}% confidence)`,
      className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-700",
    };
  }
  return {
    label: `Low confidence — adjust manually (${pct}%)`,
    className: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700",
  };
}

interface MockupTemplateFormProps {
  token: string;
  storeKey: string;
  template?: MockupTemplate;
  onSaved: (template: MockupTemplate) => void;
  onCancel: () => void;
}

export function MockupTemplateForm({
  token,
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
  const [shadowStrength, setShadowStrength] = useState<string>(template?.shadowStrength?.toString() ?? "0");

  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisDescription, setAnalysisDescription] = useState<string>("");

  const [detectedValues, setDetectedValues] = useState<DetectedValues | null>(null);
  const [detectionMetadata, setDetectionMetadata] = useState<{
    confidence: number;
    description: string;
    model: string;
    source: string;
    detectedAt: string;
  } | null>(
    template?.detectionConfidence != null
      ? {
          confidence: template.detectionConfidence,
          description: template.detectionDescription ?? "",
          model: template.detectionModel ?? "",
          source: template.detectionSource ?? "ai",
          detectedAt: template.detectedAt ?? new Date().toISOString(),
        }
      : null
  );

  const [placementWasManuallyAdjusted, setPlacementWasManuallyAdjusted] = useState(
    template?.placementWasManuallyAdjusted ?? false
  );
  const [hadDetectionBeforeEdit, setHadDetectionBeforeEdit] = useState(false);

  const lastAnalyzedUrlRef = useRef<string>("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const placementErrors = validatePlacement(posterX, posterY, posterWidth, posterHeight);
  const hasPlacementErrors = Object.keys(placementErrors).length > 0;
  const hasPosterArea = posterX !== "" && posterY !== "" && posterWidth !== "" && posterHeight !== "";

  useEffect(() => {
    if (!isEdit && name && !templateKey) {
      setTemplateKey(generateKey(name));
    }
  }, [name, isEdit]);

  const handlePlacementFieldChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    if (analysisState === "detected" || hadDetectionBeforeEdit) {
      setPlacementWasManuallyAdjusted(true);
    }
  };

  const toggleFormat = (fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const applyDetectedValues = (result: DetectedValues) => {
    setPosterX(result.x.toString());
    setPosterY(result.y.toString());
    setPosterWidth(result.width.toString());
    setPosterHeight(result.height.toString());
    setRotation(result.rotation.toString());
    setPlacementWasManuallyAdjusted(false);
  };

  const applyFallbackPlacement = useCallback(
    (orient: string) => {
      const fb = getFallbackPlacement(orient);
      setPosterX(fb.x.toString());
      setPosterY(fb.y.toString());
      setPosterWidth(fb.width.toString());
      setPosterHeight(fb.height.toString());
      setRotation("0");
      setAnalysisState("fallback");
      setAnalysisDescription(
        `AI could not detect a placement area. These are safe fallback values for a ${orient} mockup — please check and adjust.`
      );
      setDetectionMetadata({
        confidence: 0,
        description: "Fallback placement applied",
        model: "",
        source: "fallback",
        detectedAt: new Date().toISOString(),
      });
      setPlacementWasManuallyAdjusted(false);
    },
    []
  );

  const runPlacementAnalysis = useCallback(
    async (imageUrl: string) => {
      if (imageUrl === lastAnalyzedUrlRef.current) return;
      lastAnalyzedUrlRef.current = imageUrl;

      setAnalysisState("analyzing");
      setAnalysisDescription("");
      setHadDetectionBeforeEdit(false);

      try {
        const result = await analyzeMockupPlacement(token, imageUrl);
        if (
          result.detected &&
          result.x != null &&
          result.y != null &&
          result.width != null &&
          result.height != null
        ) {
          const detected: DetectedValues = {
            x: result.x,
            y: result.y,
            width: result.width,
            height: result.height,
            rotation: result.rotation ?? 0,
            confidence: result.confidence,
            description: result.description,
            model: result.model,
          };
          setDetectedValues(detected);
          setDetectionMetadata({
            confidence: result.confidence,
            description: result.description,
            model: result.model,
            source: "ai",
            detectedAt: new Date().toISOString(),
          });
          applyDetectedValues(detected);
          setAnalysisState("detected");
          setAnalysisDescription(result.description);
          setHadDetectionBeforeEdit(true);
        } else {
          setAnalysisState("not-detected");
          setAnalysisDescription(result.description ?? "No placement area found.");
          applyFallbackPlacement(orientation);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Analysis failed";
        setAnalysisState("error");
        setAnalysisDescription(msg);
        lastAnalyzedUrlRef.current = "";
        applyFallbackPlacement(orientation);
      }
    },
    [token, orientation, applyFallbackPlacement]
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
    setAnalysisState("idle");
    lastAnalyzedUrlRef.current = "";
    try {
      const { uploadURL, objectPath } = await requestMockupImageUploadUrl(token, {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      await uploadMockupImageFile(uploadURL, file);
      const servingUrl = getStorageUrl(objectPath);
      setStoragePath(objectPath);
      setBackgroundImageUrl(servingUrl);
      setUploadProgress("done");
      toast({ title: "Image uploaded — detecting placement…" });
      await runPlacementAnalysis(servingUrl);
    } catch (e: unknown) {
      setUploadProgress("idle");
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    }
  };

  const handleUrlChange = (url: string) => {
    setBackgroundImageUrl(url);
    if (!url) {
      setStoragePath("");
      setAnalysisState("idle");
      lastAnalyzedUrlRef.current = "";
    }
  };

  const handleManualDetect = () => {
    if (!backgroundImageUrl || analysisState === "analyzing") return;
    lastAnalyzedUrlRef.current = "";
    runPlacementAnalysis(backgroundImageUrl);
  };

  const handleResetToDetected = () => {
    if (!detectedValues) return;
    applyDetectedValues(detectedValues);
    setPlacementWasManuallyAdjusted(false);
    toast({ title: "Placement reset to AI-detected values" });
  };

  const handleResetToFallback = () => {
    applyFallbackPlacement(orientation);
    toast({ title: "Placement reset to default fallback" });
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
        shadowStrength: shadowStrength !== "" ? parseFloat(shadowStrength) : undefined,
        ...(detectionMetadata
          ? {
              detectionConfidence: detectionMetadata.confidence,
              detectionDescription: detectionMetadata.description,
              detectionSource: detectionMetadata.source,
              detectionModel: detectionMetadata.model || undefined,
              detectedAt: detectionMetadata.detectedAt || undefined,
            }
          : {}),
        placementWasManuallyAdjusted,
      };

      let saved: MockupTemplate;
      if (isEdit && template) {
        saved = await adminUpdateMockupTemplate(token, template.id, payload);
      } else {
        saved = await adminCreateMockupTemplate(token, payload);
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

  const displayImageUrl = backgroundImageUrl || template?.previewThumbnailUrl || "";
  const confidenceBadge = detectionMetadata && detectionMetadata.confidence > 0
    ? getConfidenceBadge(detectionMetadata.confidence)
    : null;

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

          <div className="space-y-1.5">
            <Label htmlFor="mt-sort">Sort order</Label>
            <Input
              id="mt-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-24"
            />
          </div>
        </div>

        {/* Right column — image + placement */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Background image</Label>
            <div
              className={cn(
                "relative rounded-lg border-2 border-dashed transition-colors overflow-hidden",
                "border-border hover:border-primary/50",
                displayImageUrl ? "aspect-[3/4]" : "aspect-[3/4] flex flex-col items-center justify-center bg-muted/30"
              )}
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: "pointer" }}
            >
              {displayImageUrl ? (
                <>
                  <img
                    src={displayImageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {hasPosterArea && (
                    <div
                      className="absolute border-2 border-dashed border-white bg-white/15 pointer-events-none"
                      style={{
                        left: `${posterX}%`,
                        top: `${posterY}%`,
                        width: `${posterWidth}%`,
                        height: `${posterHeight}%`,
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
                        transform: rotation && parseFloat(rotation) !== 0 ? `rotate(${rotation}deg)` : undefined,
                        borderRadius: borderRadius && parseFloat(borderRadius) > 0 ? `${borderRadius}px` : undefined,
                      }}
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                        <span className="text-white text-xs font-semibold drop-shadow bg-black/60 px-1.5 py-0.5 rounded">
                          Poster area
                        </span>
                        <span className="text-white/80 text-[10px] drop-shadow bg-black/50 px-1 py-0.5 rounded">
                          {posterX}%, {posterY}% · {posterWidth}×{posterHeight}
                        </span>
                      </div>
                    </div>
                  )}
                  {analysisState === "fallback" && hasPosterArea && (
                    <div className="absolute top-2 left-2 bg-orange-500/90 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow">
                      Fallback values
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
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
                    {uploadProgress === "uploading" ? "Uploading..." : "Click to upload background image"}
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
              <div className="flex gap-2">
                <Input
                  id="mt-img-url"
                  value={backgroundImageUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://..."
                  className="text-xs h-8 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  disabled={!backgroundImageUrl || analysisState === "analyzing"}
                  onClick={handleManualDetect}
                >
                  {analysisState === "analyzing" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Detect
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" />
                Auto-detection uses AI and may have a small cost. You can also set placement manually.
              </p>
            </div>
          </div>

          {/* AI analysis status banner */}
          {analysisState !== "idle" && (
            <div
              className={cn(
                "rounded-md border px-3 py-2.5 flex items-start gap-2.5 text-sm",
                analysisState === "analyzing" && "bg-muted/50 border-border",
                analysisState === "detected" && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
                analysisState === "not-detected" && "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
                analysisState === "fallback" && "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
                analysisState === "error" && "bg-destructive/10 border-destructive/30"
              )}
            >
              {analysisState === "analyzing" && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Detecting placement area…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI is analyzing the image to find where the poster should go</p>
                  </div>
                </>
              )}
              {analysisState === "detected" && detectionMetadata && (
                <>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("font-medium text-xs px-1.5 py-0.5 rounded border", confidenceBadge?.className)}>
                        {confidenceBadge?.label}
                      </p>
                      {placementWasManuallyAdjusted && (
                        <span className="text-xs text-muted-foreground italic">adjusted</span>
                      )}
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">{analysisDescription}</p>
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5">
                      Values filled below — review and adjust as needed
                    </p>
                  </div>
                </>
              )}
              {analysisState === "fallback" && (
                <>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-orange-600" />
                  <div>
                    <p className="font-medium text-orange-800 dark:text-orange-300">Fallback placement applied</p>
                    <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">{analysisDescription}</p>
                  </div>
                </>
              )}
              {analysisState === "not-detected" && (
                <>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">No placement area detected</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{analysisDescription}</p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-500 mt-1">Safe fallback values applied — adjust as needed</p>
                  </div>
                </>
              )}
              {analysisState === "error" && (
                <>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">Detection failed</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{analysisDescription}</p>
                    <p className="text-xs text-muted-foreground mt-1">Fallback values applied — adjust as needed</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Placement area inputs */}
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Poster placement area</p>
                <div title="Define where the poster image sits inside this mockup background. Values are percentages of the image dimensions.">
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {detectedValues && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={handleResetToDetected}
                    title="Restore the AI-detected placement values"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to detected
                  </Button>
                )}
                {backgroundImageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleResetToFallback}
                    title="Apply safe default fallback values based on orientation"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Fallback
                  </Button>
                )}
                {backgroundImageUrl && analysisState !== "analyzing" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-primary hover:text-primary"
                    onClick={handleManualDetect}
                  >
                    <Sparkles className="w-3 h-3" />
                    Auto-detect
                  </Button>
                )}
                {analysisState === "analyzing" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Detecting…
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Percentage values (0–100) defining where the poster image sits inside this background.
              Leave empty if using the full image as a mockup photo (no compositing).
            </p>

            {placementWasManuallyAdjusted && detectedValues && (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" />
                Placement was manually adjusted after detection
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Left (X %)</Label>
                <Input
                  type="number"
                  value={posterX}
                  onChange={(e) => handlePlacementFieldChange(setPosterX, e.target.value)}
                  placeholder="e.g. 20"
                  className={cn(
                    "h-8 text-sm",
                    placementErrors.x && "border-destructive",
                    !placementErrors.x && analysisState === "detected" && posterX !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}
                  min={0} max={100}
                />
                {placementErrors.x && (
                  <p className="text-[11px] text-destructive">{placementErrors.x}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Top (Y %)</Label>
                <Input
                  type="number"
                  value={posterY}
                  onChange={(e) => handlePlacementFieldChange(setPosterY, e.target.value)}
                  placeholder="e.g. 15"
                  className={cn(
                    "h-8 text-sm",
                    placementErrors.y && "border-destructive",
                    !placementErrors.y && analysisState === "detected" && posterY !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}
                  min={0} max={100}
                />
                {placementErrors.y && (
                  <p className="text-[11px] text-destructive">{placementErrors.y}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Width %</Label>
                <Input
                  type="number"
                  value={posterWidth}
                  onChange={(e) => handlePlacementFieldChange(setPosterWidth, e.target.value)}
                  placeholder="e.g. 60"
                  className={cn(
                    "h-8 text-sm",
                    placementErrors.width && "border-destructive",
                    !placementErrors.width && analysisState === "detected" && posterWidth !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}
                  min={1} max={100}
                />
                {placementErrors.width && (
                  <p className="text-[11px] text-destructive">{placementErrors.width}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height %</Label>
                <Input
                  type="number"
                  value={posterHeight}
                  onChange={(e) => handlePlacementFieldChange(setPosterHeight, e.target.value)}
                  placeholder="e.g. 70"
                  className={cn(
                    "h-8 text-sm",
                    placementErrors.height && "border-destructive",
                    !placementErrors.height && analysisState === "detected" && posterHeight !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}
                  min={1} max={100}
                />
                {placementErrors.height && (
                  <p className="text-[11px] text-destructive">{placementErrors.height}</p>
                )}
              </div>
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
            <div className="space-y-1">
              <Label className="text-xs">Shadow strength (0–1)</Label>
              <Input
                type="number"
                value={shadowStrength}
                onChange={(e) => setShadowStrength(e.target.value)}
                placeholder="0"
                className="h-8 text-sm"
                min={0} max={1} step={0.1}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || uploadProgress === "uploading" || analysisState === "analyzing" || hasPlacementErrors}
          className="gap-1.5"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? "Save changes" : "Create template"}
        </Button>
      </div>
    </div>
  );
}
