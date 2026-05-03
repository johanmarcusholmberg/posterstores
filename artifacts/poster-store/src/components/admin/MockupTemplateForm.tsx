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
import { Upload, Loader2, Sparkles, CheckCircle2, AlertCircle, Info } from "lucide-react";
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

function generateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

type AnalysisState = "idle" | "analyzing" | "detected" | "not-detected" | "error";

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
  const [analysisConfidence, setAnalysisConfidence] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit && name && !templateKey) {
      setTemplateKey(generateKey(name));
    }
  }, [name, isEdit]);

  const toggleFormat = (fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const runPlacementAnalysis = useCallback(
    async (imageUrl: string) => {
      setAnalysisState("analyzing");
      setAnalysisDescription("");
      try {
        const result = await analyzeMockupPlacement(token, imageUrl);
        if (result.detected && result.x != null && result.y != null && result.width != null && result.height != null) {
          setPosterX(result.x.toString());
          setPosterY(result.y.toString());
          setPosterWidth(result.width.toString());
          setPosterHeight(result.height.toString());
          setRotation((result.rotation ?? 0).toString());
          setAnalysisState("detected");
          setAnalysisDescription(result.description);
          setAnalysisConfidence(result.confidence);
        } else {
          setAnalysisState("not-detected");
          setAnalysisDescription(result.description ?? "No placement area found. Set values manually.");
        }
      } catch (e: any) {
        setAnalysisState("error");
        setAnalysisDescription(e?.message ?? "Analysis failed");
      }
    },
    [token]
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
    } catch (e: any) {
      setUploadProgress("idle");
      toast({ variant: "destructive", title: "Upload failed", description: e?.message });
    }
  };

  const handleUrlChange = (url: string) => {
    setBackgroundImageUrl(url);
    if (!url) {
      setStoragePath("");
      setAnalysisState("idle");
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
      };

      let saved: MockupTemplate;
      if (isEdit && template) {
        saved = await adminUpdateMockupTemplate(token, template.id, payload);
      } else {
        saved = await adminCreateMockupTemplate(token, payload);
      }
      toast({ title: isEdit ? "Template updated" : "Template created" });
      onSaved(saved);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const displayImageUrl = backgroundImageUrl || template?.previewThumbnailUrl || "";
  const hasPosterArea = posterX !== "" && posterY !== "" && posterWidth !== "" && posterHeight !== "";

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
                      className="absolute border-2 border-dashed border-white/80 bg-white/15 pointer-events-none"
                      style={{
                        left: `${posterX}%`,
                        top: `${posterY}%`,
                        width: `${posterWidth}%`,
                        height: `${posterHeight}%`,
                        transform: rotation && parseFloat(rotation) !== 0 ? `rotate(${rotation}deg)` : undefined,
                        borderRadius: borderRadius && parseFloat(borderRadius) > 0 ? `${borderRadius}px` : undefined,
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white text-xs font-medium drop-shadow bg-black/50 px-1.5 py-0.5 rounded">
                          Poster area
                        </span>
                      </div>
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
                {backgroundImageUrl && analysisState !== "analyzing" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs shrink-0"
                    onClick={() => runPlacementAnalysis(backgroundImageUrl)}
                  >
                    <Sparkles className="w-3 h-3" />
                    Detect
                  </Button>
                )}
              </div>
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
              {analysisState === "detected" && (
                <>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                      Placement detected ({Math.round(analysisConfidence * 100)}% confidence)
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">{analysisDescription}</p>
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-1">
                      Values filled below — review and adjust as needed
                    </p>
                  </div>
                </>
              )}
              {analysisState === "not-detected" && (
                <>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">No placement area detected</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{analysisDescription}</p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-500 mt-1">Set the values manually below</p>
                  </div>
                </>
              )}
              {analysisState === "error" && (
                <>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">Detection failed</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{analysisDescription}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Placement area inputs */}
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Poster placement area</p>
                <div title="Define where the poster image sits inside this mockup background. Values are percentages of the image dimensions.">
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </div>
              </div>
              {backgroundImageUrl && analysisState !== "analyzing" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-primary hover:text-primary"
                  onClick={() => runPlacementAnalysis(backgroundImageUrl)}
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
            <p className="text-xs text-muted-foreground">
              Percentage values (0–100) defining where the poster image sits inside this background.
              Leave empty if using the full image as a mockup photo (no compositing).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Left (X %)</Label>
                <Input
                  type="number"
                  value={posterX}
                  onChange={(e) => setPosterX(e.target.value)}
                  placeholder="e.g. 20"
                  className={cn("h-8 text-sm", analysisState === "detected" && posterX !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20")}
                  min={0} max={100}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Top (Y %)</Label>
                <Input
                  type="number"
                  value={posterY}
                  onChange={(e) => setPosterY(e.target.value)}
                  placeholder="e.g. 15"
                  className={cn("h-8 text-sm", analysisState === "detected" && posterY !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20")}
                  min={0} max={100}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Width %</Label>
                <Input
                  type="number"
                  value={posterWidth}
                  onChange={(e) => setPosterWidth(e.target.value)}
                  placeholder="e.g. 60"
                  className={cn("h-8 text-sm", analysisState === "detected" && posterWidth !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20")}
                  min={1} max={100}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height %</Label>
                <Input
                  type="number"
                  value={posterHeight}
                  onChange={(e) => setPosterHeight(e.target.value)}
                  placeholder="e.g. 70"
                  className={cn("h-8 text-sm", analysisState === "detected" && posterHeight !== "" && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20")}
                  min={1} max={100}
                />
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
          disabled={saving || uploadProgress === "uploading" || analysisState === "analyzing"}
          className="gap-1.5"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? "Save changes" : "Create template"}
        </Button>
      </div>
    </div>
  );
}
