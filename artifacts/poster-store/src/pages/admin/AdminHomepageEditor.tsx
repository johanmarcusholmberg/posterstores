import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminGetHomepageVisual,
  adminUpdateHomepageVisual,
  adminGetStore,
  requestStorageUploadUrl,
  type HomepageVisualConfig,
  type HeroVisualConfig,
  type HeroButtonConfig,
  type HeroButtonStyleConfig,
  type HeroTrustBadge,
  type CollectionBannerVisualConfig,
  type HomepageSectionConfig,
  type SectionFontOverrides,
  type SectionColorOverrides,
  type AdminStore,
} from "@/lib/adminApi";

import {
  DEFAULT_HOMEPAGE_SECTIONS,
  type HomepageSectionType,
} from "@/config/storefronts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  Loader2,
  Save,
  X,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  Plus,
  Copy,
  Trash2,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STORE_FONT_OPTIONS, INHERIT_FONT_VALUE } from "@/lib/storeFonts";

const DEFAULT_TRUST_BADGE_TEXTS = ["Fine art prints", "Ships worldwide", "Sustainably made"];

// ─── Upload helpers ────────────────────────────────────────────────────────

async function uploadImageFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ url: string; storagePath: string }> {
  const meta = await requestStorageUploadUrl(file.name, file.size, file.type);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.open("PUT", meta.uploadURL);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
  return { url: `/api/storage${meta.objectPath}`, storagePath: meta.objectPath };
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type))
    return `File type not supported. Please upload a JPG, PNG, or WebP image.`;
  if (file.size > MAX_FILE_BYTES)
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`;
  return null;
}

// ─── Image Uploader ────────────────────────────────────────────────────────

interface ImageUploaderProps {
  label: string;
  hint?: string;
  recommendedSpec?: string;
  currentUrl?: string | null;
  onUpload: (url: string, storagePath: string) => void;
  onRemove: () => void;
}

function ImageUploader({ label, hint, recommendedSpec, currentUrl, onUpload, onRemove }: ImageUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (file: File) => {
    const err = validateImageFile(file);
    if (err) { setUploadError(err); return; }
    setLocalPreview(URL.createObjectURL(file));
    setUploading(true);
    setUploadError("");
    setProgress(0);
    try {
      const { url, storagePath } = await uploadImageFile(file, setProgress);
      onUpload(url, storagePath);
    } catch (e: unknown) {
      setUploadError((e as Error)?.message ?? "Upload failed");
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = localPreview ?? currentUrl;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
      {displayUrl ? (
        <div className="relative group rounded-md overflow-hidden border border-border bg-muted/20">
          <img src={displayUrl} alt={label} className="w-full max-h-52 object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-white text-sm font-semibold">{progress}%</div>
            </div>
          )}
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="bg-background/90 rounded-md p-1.5 hover:bg-background shadow-sm border border-border" title="Replace image">
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => { setLocalPreview(null); onRemove(); }}
                className="bg-background/90 rounded-md p-1.5 hover:bg-background shadow-sm border border-border text-destructive" title="Remove image">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className={cn(
            "w-full border-2 border-dashed border-border rounded-md py-8 flex flex-col items-center gap-2 text-muted-foreground transition-colors",
            uploading ? "opacity-50 cursor-not-allowed" : "hover:border-primary/40 hover:text-primary cursor-pointer"
          )}>
          {uploading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">{progress}%</span></>
          ) : (
            <><ImageIcon className="w-5 h-5" /><span className="text-sm font-medium">Click to upload</span></>
          )}
        </button>
      )}
      {recommendedSpec && (
        <p className="text-xs text-muted-foreground">{recommendedSpec}</p>
      )}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ─── Color picker field ────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (v: string | null) => void;
}) {
  const val = value ?? "";
  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(val);

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={isValidHex ? val : "#888888"}
          onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-border cursor-pointer shrink-0 p-0.5 bg-background"
          title="Pick color"
        />
        <Input
          value={val}
          placeholder="inherit"
          className="h-7 text-xs font-mono min-w-0 flex-1"
          onChange={e => {
            const v = e.target.value;
            onChange(v.trim() || null);
          }}
        />
        {val && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
            title="Clear — inherit global default"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Font field ────────────────────────────────────────────────────────────

/**
 * Font override dropdown. Uses the same canonical font list as Store Settings.
 * Selecting "Inherit global default" saves null (no override).
 * If an old/custom value not in the list is loaded, it maps to INHERIT_FONT_VALUE
 * (treated as "no override") so the UI never crashes; the value is preserved in
 * state until the user picks a new option.
 */
function FontField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (v: string | null) => void;
}) {
  const isKnown = value != null && (STORE_FONT_OPTIONS as readonly string[]).includes(value);
  const selectValue = value && isKnown ? value : INHERIT_FONT_VALUE;

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={selectValue}
        onValueChange={v => onChange(v === INHERIT_FONT_VALUE ? null : v)}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT_FONT_VALUE} className="text-xs text-muted-foreground italic">
            Inherit global default
          </SelectItem>
          {STORE_FONT_OPTIONS.map(f => (
            <SelectItem key={f} value={f} className="text-xs">
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Collapsible override panel ────────────────────────────────────────────

function CollapsibleOverridePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/70 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
      >
        <span className="text-sm font-medium text-foreground/80">{title}</span>
        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-90")} />
      </button>
      {open && (
        <div className="p-3 border-t border-border/50 space-y-3">
          <p className="text-xs text-muted-foreground italic">
            Leave blank to inherit global brand defaults.
          </p>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

function SectionCard({ title, description, children, className }: {
  title: string; description?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5 space-y-5", className)}>
      <div className={cn("border-b border-border pb-3", !description && "pb-0 border-0")}>
        <h2 className="font-semibold text-base">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Section label helper ──────────────────────────────────────────────────

const SECTION_LABELS: Record<HomepageSectionType, string> = {
  hero: "Hero",
  featuredPosters: "Featured posters",
  collectionBanner: "Collection banner",
  exploreLinks: "Explore links",
  newArrivals: "New arrivals",
  brandStory: "Brand story",
  valueProps: "Value props",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeSortOrders(sections: HomepageSectionConfig[]): HomepageSectionConfig[] {
  return [...sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) => ({ ...s, sortOrder: (i + 1) * 10 }));
}

// ─── Collection Banner Editor ──────────────────────────────────────────────

interface CollectionBannerEditorProps {
  banner: CollectionBannerVisualConfig;
  bannerLabel: string;
  totalBanners: number;
  onUpdate: (patch: Partial<CollectionBannerVisualConfig>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function CollectionBannerEditor({ banner, bannerLabel, totalBanners, onUpdate, onDuplicate, onRemove }: CollectionBannerEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const overlayPct = Math.round((banner.backgroundOverlayOpacity ?? 0.35) * 100);
  const imageFit = banner.imageFit ?? "cover";

  const co = banner.colorOverrides ?? {};
  const fo = banner.fontOverrides ?? {};

  const setColor = (key: keyof SectionColorOverrides, v: string | null) =>
    onUpdate({ colorOverrides: { ...banner.colorOverrides, [key]: v } });
  const setFont = (key: keyof SectionFontOverrides, v: string | null) =>
    onUpdate({ fontOverrides: { ...banner.fontOverrides, [key]: v } });

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-2 text-left min-w-0">
          <ChevronRight className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
          <span className="font-medium text-sm truncate">
            {bannerLabel}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onDuplicate} title="Duplicate"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-3.5 h-3.5" />
          </button>
          {totalBanners > 1 && (
            <button type="button" onClick={onRemove} title="Remove"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">

          {/* Display style toggle */}
          <div className="space-y-1.5">
            <Label>Display style</Label>
            <div className="flex gap-2">
              {(["visual", "simple"] as const).map((style) => (
                <button key={style} type="button"
                  onClick={() => onUpdate({ displayStyle: style })}
                  className={cn(
                    "flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors",
                    (banner.displayStyle ?? "visual") === style
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-background hover:bg-muted"
                  )}>
                  {style === "visual" ? "Visual (image)" : "Simple (text strip)"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {(banner.displayStyle ?? "visual") === "simple"
                ? "Flat editorial strip — no image needed. Uses background color below."
                : "Full-bleed background image with text overlay."}
            </p>
          </div>

          {(banner.displayStyle ?? "visual") === "visual" && (
          <><ImageUploader
            label="Background image"
            hint="Fills the banner background. Leave empty for the default warm sand tone."
            recommendedSpec={
              imageFit === "cover"
                ? "1920×295 or wider recommended (13:2 ratio). Cover mode fills the frame; edges may crop on narrow screens. Keep important content centered."
                : "1920×295 or wider recommended (13:2 ratio). Contain mode keeps the full image visible with a background fill."
            }
            currentUrl={banner.backgroundImageUrl}
            onUpload={(url, storagePath) => onUpdate({ backgroundImageUrl: url, backgroundStoragePath: storagePath })}
            onRemove={() => onUpdate({ backgroundImageUrl: null, backgroundStoragePath: null })}
          />

          {/* Image fit */}
          <div className="space-y-1.5">
            <Label>Image fit</Label>
            <div className="flex gap-2">
              {(["cover", "contain"] as const).map(fit => (
                <button key={fit} type="button"
                  onClick={() => onUpdate({ imageFit: fit })}
                  className={cn(
                    "flex-1 text-sm py-1.5 rounded-md border font-medium transition-colors",
                    imageFit === fit
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-background hover:bg-muted"
                  )}>
                  {fit === "cover" ? "Cover (fills frame, may crop)" : "Contain (full image visible)"}
                </button>
              ))}
            </div>
          </div>

          {/* Focal point — only relevant for cover */}
          {imageFit === "cover" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Focal point — horizontal</Label>
                <Select
                  value={banner.focalPointX ?? "center"}
                  onValueChange={(v) => onUpdate({ focalPointX: v as "left" | "center" | "right" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Focal point — vertical</Label>
                <Select
                  value={banner.focalPointY ?? "center"}
                  onValueChange={(v) => onUpdate({ focalPointY: v as "top" | "center" | "bottom" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Overlay */}
          {banner.backgroundImageUrl && (
            <div className="space-y-1.5">
              <Label>Overlay darkness — {overlayPct}%</Label>
              <Slider min={0} max={80} step={5} value={[overlayPct]}
                onValueChange={([v]) => onUpdate({ backgroundOverlayOpacity: v / 100 })} />
            </div>
          )}
          </>)}

          {/* Text fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Eyebrow text</Label>
              <Input value={banner.eyebrow ?? ""} onChange={e => onUpdate({ eyebrow: e.target.value || null })}
                placeholder="COLLECTION" />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={banner.title ?? ""} onChange={e => onUpdate({ title: e.target.value || null })}
                placeholder="Mediterranean Walls" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={banner.text ?? ""} onChange={e => onUpdate({ text: e.target.value || null })}
              placeholder="Warm-toned prints inspired by Spanish streets, terraces and coastlines." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CTA button text</Label>
              <Input value={banner.ctaText ?? ""} onChange={e => onUpdate({ ctaText: e.target.value || null })}
                placeholder="Explore coastal posters" />
            </div>
            <div className="space-y-1.5">
              <Label>CTA link</Label>
              <Input value={banner.ctaLink ?? ""} onChange={e => onUpdate({ ctaLink: e.target.value || null })}
                placeholder="/shop?category=Coastal+Posters" />
            </div>
          </div>

          {/* Show poster cards */}
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Show poster cards</p>
              <p className="text-xs text-muted-foreground">Display selected posters on the banner overlay</p>
            </div>
            <Switch
              checked={banner.showPosterCards ?? false}
              onCheckedChange={(v) => onUpdate({ showPosterCards: v })}
            />
          </div>

          {/* Layout controls */}
          <div className="space-y-3 pt-1 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Layout</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Text position</Label>
                <Select
                  value={banner.textHAlign ?? "left"}
                  onValueChange={v => onUpdate({ textHAlign: v as "left" | "center" | "right" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vertical position</Label>
                <Select
                  value={banner.textVAlign ?? "center"}
                  onValueChange={v => onUpdate({ textVAlign: v as "top" | "center" | "bottom" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Text max width</Label>
                <Select
                  value={banner.textMaxWidth ?? "medium"}
                  onValueChange={v => onUpdate({ textMaxWidth: v as "narrow" | "medium" | "wide" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="narrow">Narrow</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="wide">Wide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Readable overlay</Label>
                <Select
                  value={banner.textOverlay ?? "none"}
                  onValueChange={v => onUpdate({ textOverlay: v as "none" | "soft-panel" | "gradient" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="soft-panel">Soft panel</SelectItem>
                    <SelectItem value="gradient">Gradient</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mobile mode</Label>
              <Select
                value={banner.mobileMode ?? "simplified-card"}
                onValueChange={v => onUpdate({ mobileMode: v as "full-banner" | "simplified-card" | "hidden" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-banner">Full banner</SelectItem>
                  <SelectItem value="simplified-card">Simplified card (recommended)</SelectItem>
                  <SelectItem value="hidden">Hidden on mobile</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                "Simplified card" shows a clean text + image card on mobile instead of the full-bleed banner.
              </p>
            </div>
          </div>

          {/* Fine-position offsets */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fine position (px)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Offset X</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    min={-300} max={300} step={5}
                    value={[banner.textOffsetX ?? 0]}
                    onValueChange={([v]) => onUpdate({ textOffsetX: v === 0 ? undefined : v })}
                    className="flex-1"
                  />
                  <span className="text-xs tabular-nums w-12 text-right">{banner.textOffsetX ?? 0}px</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Offset Y</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    min={-300} max={300} step={5}
                    value={[banner.textOffsetY ?? 0]}
                    onValueChange={([v]) => onUpdate({ textOffsetY: v === 0 ? undefined : v })}
                    className="flex-1"
                  />
                  <span className="text-xs tabular-nums w-12 text-right">{banner.textOffsetY ?? 0}px</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Fine-tune text position on top of the selected anchor. Range: −300 to +300 px. Default: 0.</p>
          </div>

          {/* Shop grid */}
          <div className="space-y-3 pt-1 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Shop grid</p>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Show in shop grid</p>
                <p className="text-xs text-muted-foreground">Inject this banner between poster rows on the shop page</p>
              </div>
              <Switch
                checked={banner.showInShop ?? false}
                onCheckedChange={(v) => onUpdate({ showInShop: v })}
              />
            </div>
            {banner.showInShop && (
              <>
                <div className="space-y-1.5">
                  <Label>Insert after N posters</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={banner.shopInsertAfter ?? ""}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      onUpdate({ shopInsertAfter: isNaN(v) ? undefined : v });
                    }}
                    placeholder="e.g. 8 (after first two rows on a 4-col desktop)"
                  />
                  <p className="text-xs text-muted-foreground">
                    The banner appears after this many posters. On a 4-column desktop grid: 4 = after row 1, 8 = after row 2, etc.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Shop display style</Label>
                  <div className="flex gap-2">
                    {(["visual", "simple"] as const).map((style) => (
                      <button key={style} type="button"
                        onClick={() => onUpdate({ shopDisplayStyle: style })}
                        className={cn(
                          "flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors",
                          (banner.shopDisplayStyle ?? "visual") === style
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border bg-background hover:bg-muted"
                        )}>
                        {style === "visual" ? "Visual (image)" : "Simple (text strip)"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Independent from the homepage display style.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile treatment</Label>
                  <Select
                    value={banner.shopMobileMode ?? "simplified-card"}
                    onValueChange={v => onUpdate({ shopMobileMode: v as "full-banner" | "simplified-card" | "hidden" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-banner">Full banner</SelectItem>
                      <SelectItem value="simplified-card">Simplified card (recommended)</SelectItem>
                      <SelectItem value="hidden">Hidden on mobile</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How the banner renders on the 2-column mobile shop grid.</p>
                </div>
              </>
            )}
          </div>

          {/* Banner visual overrides */}
          <CollapsibleOverridePanel title="Banner visual overrides">
            <div className="grid grid-cols-2 gap-3">
              <FontField label="Heading font" value={fo.headingFont} onChange={v => setFont("headingFont", v)} />
              <FontField label="Body font" value={fo.bodyFont} onChange={v => setFont("bodyFont", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Eyebrow color" value={co.eyebrowColor} onChange={v => setColor("eyebrowColor", v)} />
              <ColorField label="Heading color" value={co.headingColor} onChange={v => setColor("headingColor", v)} />
              <ColorField label="Text color" value={co.textColor} onChange={v => setColor("textColor", v)} />
              <ColorField label="CTA / link color" value={co.linkColor} onChange={v => setColor("linkColor", v)} />
              <ColorField label="Background color fallback" value={co.backgroundColor} onChange={v => setColor("backgroundColor", v)} />
              <ColorField label="Overlay color" value={co.overlayColor} onChange={v => setColor("overlayColor", v)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Overlay opacity — {Math.round((co.overlayOpacity ?? 0) * 100)}%
                {co.overlayOpacity == null && (
                  <span className="ml-1.5 text-muted-foreground font-normal">(using slider above)</span>
                )}
              </Label>
              <Slider
                min={0} max={100} step={5}
                value={[Math.round((co.overlayOpacity ?? 0) * 100)]}
                onValueChange={([v]) => setColor("overlayOpacity" as any, v === 0 ? null : v / 100 as any)}
              />
              <p className="text-xs text-muted-foreground">Set to override the overlay slider above. 0% = not set.</p>
            </div>
          </CollapsibleOverridePanel>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function AdminHomepageEditor() {
  const { adminStoreKey } = useAdminToken();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [storeData, setStoreData] = useState<AdminStore | null>(null);
  const [config, setConfig] = useState<HomepageVisualConfig>({ hero: {} });

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      adminGetHomepageVisual(adminStoreKey),
      adminGetStore(adminStoreKey).catch(() => null),
    ])
      .then(([visual, store]) => {
        // Transparent migration: if legacy collectionBanner exists but no collectionBanners, promote it
        let normalized: HomepageVisualConfig = { hero: {}, ...visual };
        if (visual.collectionBanner && !visual.collectionBanners?.length) {
          normalized = {
            ...normalized,
            collectionBanners: [{ ...visual.collectionBanner, id: "default" }],
          };
        }
        setConfig(normalized);
        setStoreData(store as AdminStore | null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load homepage config"))
      .finally(() => setLoading(false));
  }, [adminStoreKey]);

  useEffect(() => { load(); }, [load]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const workingSections = useMemo((): HomepageSectionConfig[] => {
    if (config.sections && config.sections.length > 0) {
      return [...config.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return [...DEFAULT_HOMEPAGE_SECTIONS];
  }, [config.sections]);

  const workingBanners = useMemo((): CollectionBannerVisualConfig[] => {
    return config.collectionBanners ?? [];
  }, [config.collectionBanners]);

  const bannerById = useMemo((): Record<string, CollectionBannerVisualConfig> => {
    const map: Record<string, CollectionBannerVisualConfig> = {};
    for (const b of workingBanners) { if (b.id) map[b.id] = b; }
    return map;
  }, [workingBanners]);

  // Per-section-type derived configs for override panels
  const heroSection = useMemo(
    () => workingSections.find(s => s.type === "hero") ?? null,
    [workingSections]
  );
  const featuredSection = useMemo(
    () => workingSections.find(s => s.type === "featuredPosters") ?? null,
    [workingSections]
  );
  const newArrivalsSection = useMemo(
    () => workingSections.find(s => s.type === "newArrivals") ?? null,
    [workingSections]
  );
  const brandStorySection = useMemo(
    () => workingSections.find(s => s.type === "brandStory") ?? null,
    [workingSections]
  );

  // ── Section operations ────────────────────────────────────────────────────

  const updateSections = useCallback((updater: (prev: HomepageSectionConfig[]) => HomepageSectionConfig[]) => {
    setConfig(c => {
      const prev = c.sections && c.sections.length > 0 ? [...c.sections] : [...DEFAULT_HOMEPAGE_SECTIONS];
      return { ...c, sections: normalizeSortOrders(updater(prev)) };
    });
  }, []);

  /** Update colorOverrides or fontOverrides for a specific section type. */
  const updateSectionOverrides = useCallback((
    type: HomepageSectionType,
    field: "colorOverrides" | "fontOverrides",
    patch: Partial<SectionColorOverrides> | Partial<SectionFontOverrides>
  ) => {
    updateSections(prev =>
      prev.map(s =>
        s.type === type
          ? { ...s, [field]: { ...(s[field] ?? {}), ...patch } }
          : s
      )
    );
  }, [updateSections]);

  const moveSectionUp = (id: string) => {
    setConfig(c => {
      const sections = normalizeSortOrders(
        c.sections && c.sections.length > 0 ? [...c.sections] : [...DEFAULT_HOMEPAGE_SECTIONS]
      );
      const idx = sections.findIndex(s => s.id === id);
      if (idx <= 0) return c;
      const tmp = sections[idx].sortOrder;
      sections[idx] = { ...sections[idx], sortOrder: sections[idx - 1].sortOrder };
      sections[idx - 1] = { ...sections[idx - 1], sortOrder: tmp };
      return { ...c, sections: normalizeSortOrders(sections) };
    });
  };

  const moveSectionDown = (id: string) => {
    setConfig(c => {
      const sections = normalizeSortOrders(
        c.sections && c.sections.length > 0 ? [...c.sections] : [...DEFAULT_HOMEPAGE_SECTIONS]
      );
      const idx = sections.findIndex(s => s.id === id);
      if (idx < 0 || idx >= sections.length - 1) return c;
      const tmp = sections[idx].sortOrder;
      sections[idx] = { ...sections[idx], sortOrder: sections[idx + 1].sortOrder };
      sections[idx + 1] = { ...sections[idx + 1], sortOrder: tmp };
      return { ...c, sections: normalizeSortOrders(sections) };
    });
  };

  const toggleSectionVisible = (id: string) => {
    updateSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const restoreDefaultOrder = () => {
    setConfig(c => {
      const existingSections = c.sections && c.sections.length > 0
        ? c.sections
        : [...DEFAULT_HOMEPAGE_SECTIONS];
      const defaultIds = new Set(DEFAULT_HOMEPAGE_SECTIONS.map(s => s.id));
      const currentById = new Map(existingSections.map(s => [s.id, s]));

      // Rebuild default sections preserving visibility, font and color overrides
      const defaultSections: HomepageSectionConfig[] = DEFAULT_HOMEPAGE_SECTIONS.map(def => {
        const existing = currentById.get(def.id);
        return {
          ...def,
          visible: existing?.visible ?? def.visible,
          fontOverrides: existing?.fontOverrides ?? def.fontOverrides ?? null,
          colorOverrides: existing?.colorOverrides ?? def.colorOverrides ?? null,
        };
      });

      // Preserve any custom sections (e.g. extra collection banners) appended after defaults
      const customSections = existingSections.filter(s => !defaultIds.has(s.id));

      return { ...c, sections: normalizeSortOrders([...defaultSections, ...customSections]) };
    });
    setShowResetConfirm(false);
  };

  // ── Banner operations ─────────────────────────────────────────────────────

  const addBanner = () => {
    const newId = `banner-${Date.now()}`;
    const newBanner: CollectionBannerVisualConfig = {
      id: newId,
      visible: true,
      imageFit: "cover",
      focalPointX: "center",
      focalPointY: "center",
      showPosterCards: false,
      backgroundOverlayOpacity: 0.35,
    };
    const maxOrder = Math.max(...workingSections.map(s => s.sortOrder), 0);
    const newSection: HomepageSectionConfig = {
      id: `section-${newId}`,
      type: "collectionBanner",
      visible: true,
      sortOrder: maxOrder + 10,
      bannerId: newId,
    };
    setConfig(c => ({
      ...c,
      collectionBanners: [...(c.collectionBanners ?? []), newBanner],
      sections: normalizeSortOrders([
        ...(c.sections && c.sections.length > 0 ? c.sections : [...DEFAULT_HOMEPAGE_SECTIONS]),
        newSection,
      ]),
    }));
  };

  const duplicateBanner = (bannerId: string) => {
    const original = bannerById[bannerId];
    if (!original) return;
    const newId = `banner-${Date.now()}`;
    const newBanner: CollectionBannerVisualConfig = { ...original, id: newId };
    const originalSection = workingSections.find(s => s.bannerId === bannerId);
    const maxOrder = Math.max(...workingSections.map(s => s.sortOrder), 0);
    const newSection: HomepageSectionConfig = {
      id: `section-${newId}`,
      type: "collectionBanner",
      visible: true,
      sortOrder: maxOrder + 10,
      bannerId: newId,
      ...(originalSection ? { titleOverride: originalSection.titleOverride } : {}),
    };
    setConfig(c => ({
      ...c,
      collectionBanners: [...(c.collectionBanners ?? []), newBanner],
      sections: normalizeSortOrders([
        ...(c.sections && c.sections.length > 0 ? c.sections : [...DEFAULT_HOMEPAGE_SECTIONS]),
        newSection,
      ]),
    }));
  };

  const removeBanner = (bannerId: string) => {
    setConfig(c => ({
      ...c,
      collectionBanners: (c.collectionBanners ?? []).filter(b => b.id !== bannerId),
      sections: normalizeSortOrders(
        (c.sections && c.sections.length > 0 ? c.sections : [...DEFAULT_HOMEPAGE_SECTIONS])
          .filter(s => !(s.type === "collectionBanner" && s.bannerId === bannerId))
      ),
    }));
  };

  const updateBanner = (bannerId: string, patch: Partial<CollectionBannerVisualConfig>) => {
    setConfig(c => ({
      ...c,
      collectionBanners: (c.collectionBanners ?? []).map(b =>
        b.id === bannerId ? { ...b, ...patch } : b
      ),
    }));
  };

  // ── Hero ─────────────────────────────────────────────────────────────────

  const setHero = (patch: Partial<HeroVisualConfig>) =>
    setConfig(c => ({ ...c, hero: { ...c.hero, ...patch } }));

  // ── Preview ───────────────────────────────────────────────────────────────

  const [previewing, setPreviewing] = useState(false);

  async function handlePreview() {
    setPreviewing(true);
    try {
      const toPreview: HomepageVisualConfig = {
        ...config,
        sections: workingSections,
        collectionBanners: workingBanners,
        collectionBanner: undefined,
      };
      const res = await fetch(`/api/stores/${encodeURIComponent(adminStoreKey)}/homepage-visual/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(toPreview),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(typeof body.error === "string" ? body.error : "Preview failed");
      }
      const { token } = await res.json() as { token: string };
      const previewBase = storeData?.routePrefix
        ? `/${storeData.routePrefix}/`
        : "/";
      window.open(
        `${previewBase}?preview=${encodeURIComponent(token)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const toSave: HomepageVisualConfig = {
        ...config,
        sections: workingSections,
        collectionBanners: workingBanners,
        collectionBanner: undefined,
      };
      const saved = await adminUpdateHomepageVisual(adminStoreKey, toSave);
      let normalized: HomepageVisualConfig = { hero: {}, ...saved };
      if (saved.collectionBanner && !saved.collectionBanners?.length) {
        normalized = { ...normalized, collectionBanners: [{ ...saved.collectionBanner, id: "default" }] };
      }
      setConfig(normalized);
      setSuccess("Saved successfully. Changes are live on the homepage.");
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Derived render data ───────────────────────────────────────────────────

  const hero = config.hero ?? {};
  const heroOverlay = Math.round((hero.backgroundOverlayOpacity ?? 0.3) * 100);

  const orderedBannerSections = workingSections.filter(s => s.type === "collectionBanner");

  const theme = storeData?.themeConfig;
  const typo = storeData?.typographyConfig;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminDashboardLayout
      title="Homepage Editor"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Homepage Editor" },
      ]}
    >
      <div className="max-w-2xl space-y-6">

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : (
          <>
            {/* ── Global brand defaults ───────────────────────────────── */}
            <SectionCard title="Global brand defaults" description="Theme and typography applied across the store.">
              {(theme || typo) ? (
                <div className="space-y-3 text-sm">
                  {theme && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Theme colors</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(theme).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-1.5 text-xs">
                            <span className="w-4 h-4 rounded-sm border border-border/50 inline-block shrink-0"
                              style={{ backgroundColor: value as string }} />
                            <span className="text-muted-foreground capitalize">{key}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {typo && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Typography</p>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        {typo.headingFont && <p>Heading font: <span className="text-foreground">{typo.headingFont}</span></p>}
                        {typo.bodyFont && <p>Body font: <span className="text-foreground">{typo.bodyFont}</span></p>}
                        {typo.heroTextMode && <p>Hero text mode: <span className="text-foreground">{typo.heroTextMode}</span></p>}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No theme or typography configured yet.</p>
              )}
              <div className="pt-1">
                <Link href={`/admin/stores/${adminStoreKey}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Edit in Store Settings
                  </Button>
                </Link>
              </div>
            </SectionCard>

            {/* ── Homepage layout ─────────────────────────────────────── */}
            <SectionCard
              title="Homepage layout"
              description="Use the arrows to reorder sections. Toggle the eye icon to show or hide a section."
            >
              <div className="space-y-1.5">
                {workingSections.map((section, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === workingSections.length - 1;
                  const bannerIdx = section.type === "collectionBanner"
                    ? orderedBannerSections.findIndex(s => s.id === section.id)
                    : -1;
                  const bannerTitle = section.type === "collectionBanner" && section.bannerId
                    ? bannerById[section.bannerId]?.title
                    : null;
                  const label = section.type === "collectionBanner"
                    ? `Collection banner ${bannerIdx + 1}${bannerTitle ? ` · ${bannerTitle}` : ""}`
                    : SECTION_LABELS[section.type];

                  return (
                    <div key={section.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md border",
                        section.visible ? "border-border bg-background" : "border-dashed border-border/60 bg-muted/20"
                      )}>
                      <button type="button"
                        onClick={() => toggleSectionVisible(section.id)}
                        className={cn(
                          "shrink-0 p-1 rounded transition-colors",
                          section.visible ? "text-foreground/70 hover:text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
                        )}
                        title={section.visible ? "Hide section" : "Show section"}>
                        {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>

                      <span className={cn("flex-1 text-sm font-medium", !section.visible && "text-muted-foreground/60")}>
                        {label}
                      </span>

                      <div className="flex gap-0.5 shrink-0">
                        <button type="button" onClick={() => moveSectionUp(section.id)} disabled={isFirst}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move up">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => moveSectionDown(section.id)} disabled={isLast}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move down">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={addBanner} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Add collection banner
                </Button>
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  className="gap-1.5 text-muted-foreground">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore default order
                </Button>
              </div>

              {showResetConfirm && (
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3 mt-1">
                  <div>
                    <p className="font-medium text-sm">Restore default section order?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This will reorder sections to the built-in default order, preserving all banners, content, and visual overrides. Custom collection banner sections will be appended after the defaults.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={restoreDefaultOrder}>Restore order</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── Hero section ─────────────────────────────────────────── */}
            <SectionCard title="Hero section" description="The intro banner at the top of the homepage.">
              <ImageUploader
                label="Background image"
                hint="Appears behind the title and subtitle. Leave empty for the default warm sand background."
                recommendedSpec="1920×600 or wider recommended. Cover mode may crop top/bottom on tall screens."
                currentUrl={hero.backgroundImageUrl}
                onUpload={(url, storagePath) => setHero({ backgroundImageUrl: url, backgroundStoragePath: storagePath })}
                onRemove={() => setHero({ backgroundImageUrl: null, backgroundStoragePath: null })}
              />
              {hero.backgroundImageUrl && (
                <div className="space-y-1.5">
                  <Label>Overlay darkness — {heroOverlay}%</Label>
                  <Slider min={0} max={80} step={5} value={[heroOverlay]}
                    onValueChange={([v]) => setHero({ backgroundOverlayOpacity: v / 100 })} />
                  <p className="text-xs text-muted-foreground">
                    A darker overlay makes the white text more readable over bright images.
                  </p>
                </div>
              )}

              {/* Primary button */}
              <div className="space-y-2 pt-1 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Primary button</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Button text</Label>
                    <Input value={hero.primaryButtonText ?? ""} placeholder="Browse posters"
                      onChange={e => setHero({ primaryButtonText: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Style</Label>
                    <Select value={hero.primaryButtonVariant ?? "filled"}
                      onValueChange={v => setHero({ primaryButtonVariant: v as "filled" | "outline" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="filled">Filled</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Link</Label>
                    <Input value={hero.primaryButtonLink ?? ""} placeholder="/shop"
                      onChange={e => setHero({ primaryButtonLink: e.target.value || null })} />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to default to /shop. Examples: /shop?category=Coastal+Posters, /about, https://example.com
                    </p>
                  </div>
                </div>
                <CollapsibleOverridePanel title="Primary button colors">
                  <div className="grid grid-cols-3 gap-3">
                    <ColorField
                      label="Text color"
                      value={hero.primaryButtonStyle?.textColor}
                      onChange={v => setHero({ primaryButtonStyle: { ...hero.primaryButtonStyle, textColor: v } })}
                    />
                    <ColorField
                      label="Background"
                      value={hero.primaryButtonStyle?.backgroundColor}
                      onChange={v => setHero({ primaryButtonStyle: { ...hero.primaryButtonStyle, backgroundColor: v } })}
                    />
                    <ColorField
                      label="Border"
                      value={hero.primaryButtonStyle?.borderColor}
                      onChange={v => setHero({ primaryButtonStyle: { ...hero.primaryButtonStyle, borderColor: v } })}
                    />
                  </div>
                </CollapsibleOverridePanel>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <p className="text-sm">Show on mobile</p>
                    <Switch
                      checked={hero.primaryButtonShowMobile !== false}
                      onCheckedChange={v => setHero({ primaryButtonShowMobile: v ? undefined : false })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <p className="text-sm">Show on desktop</p>
                    <Switch
                      checked={hero.primaryButtonShowDesktop !== false}
                      onCheckedChange={v => setHero({ primaryButtonShowDesktop: v ? undefined : false })}
                    />
                  </div>
                </div>
              </div>

              {/* Secondary button */}
              <div className="space-y-2 pt-1 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Secondary button</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Button text</Label>
                    <Input value={hero.secondaryButtonText ?? ""} placeholder="View all regions"
                      onChange={e => setHero({ secondaryButtonText: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Style</Label>
                    <Select value={hero.secondaryButtonVariant ?? "outline"}
                      onValueChange={v => setHero({ secondaryButtonVariant: v as "filled" | "outline" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="filled">Filled</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Link</Label>
                    <Input value={hero.secondaryButtonLink ?? ""} placeholder="/shop?region=Andalusia"
                      onChange={e => setHero({ secondaryButtonLink: e.target.value || null })} />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to default to /shop.
                    </p>
                  </div>
                </div>
                <CollapsibleOverridePanel title="Secondary button colors">
                  <div className="grid grid-cols-3 gap-3">
                    <ColorField
                      label="Text color"
                      value={hero.secondaryButtonStyle?.textColor}
                      onChange={v => setHero({ secondaryButtonStyle: { ...hero.secondaryButtonStyle, textColor: v } })}
                    />
                    <ColorField
                      label="Background"
                      value={hero.secondaryButtonStyle?.backgroundColor}
                      onChange={v => setHero({ secondaryButtonStyle: { ...hero.secondaryButtonStyle, backgroundColor: v } })}
                    />
                    <ColorField
                      label="Border"
                      value={hero.secondaryButtonStyle?.borderColor}
                      onChange={v => setHero({ secondaryButtonStyle: { ...hero.secondaryButtonStyle, borderColor: v } })}
                    />
                  </div>
                </CollapsibleOverridePanel>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <p className="text-sm">Show on mobile</p>
                    <Switch
                      checked={hero.secondaryButtonShowMobile !== false}
                      onCheckedChange={v => setHero({ secondaryButtonShowMobile: v ? undefined : false })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <p className="text-sm">Show on desktop</p>
                    <Switch
                      checked={hero.secondaryButtonShowDesktop !== false}
                      onCheckedChange={v => setHero({ secondaryButtonShowDesktop: v ? undefined : false })}
                    />
                  </div>
                </div>
              </div>

              {/* Extra buttons */}
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <Label>Extra buttons</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Additional buttons shown after primary and secondary. Accepts /shop, /about, or https://example.com.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
                    onClick={() => {
                      const newBtn: HeroButtonConfig = {
                        id: `btn-${Date.now()}`,
                        label: "",
                        link: "",
                        variant: "outline",
                        visible: true,
                      };
                      setHero({ extraButtons: [...(hero.extraButtons ?? []), newBtn] });
                    }}>
                    <Plus className="w-3.5 h-3.5" />
                    Add hero button
                  </Button>
                </div>
                {(hero.extraButtons ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No extra buttons configured.</p>
                )}
                {(hero.extraButtons ?? []).map((btn, bIdx) => (
                  <div key={btn.id} className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground flex-1">
                        Button {bIdx + 1}{btn.label ? ` · ${btn.label}` : ""}
                      </span>
                      <button type="button"
                        onClick={() => {
                          const btns = [...(hero.extraButtons ?? [])];
                          btns[bIdx] = { ...btns[bIdx], visible: btns[bIdx].visible !== false ? false : true };
                          setHero({ extraButtons: btns });
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                        title={btn.visible !== false ? "Hide button" : "Show button"}>
                        {btn.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button"
                        onClick={() => setHero({ extraButtons: (hero.extraButtons ?? []).filter((_, i) => i !== bIdx) })}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove button">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Button label</Label>
                        <Input value={btn.label}
                          placeholder="View collection"
                          onChange={e => {
                            const btns = [...(hero.extraButtons ?? [])];
                            btns[bIdx] = { ...btns[bIdx], label: e.target.value };
                            setHero({ extraButtons: btns });
                          }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Style</Label>
                        <Select value={btn.variant ?? "outline"}
                          onValueChange={v => {
                            const btns = [...(hero.extraButtons ?? [])];
                            btns[bIdx] = { ...btns[bIdx], variant: v as "filled" | "outline" };
                            setHero({ extraButtons: btns });
                          }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="filled">Filled</SelectItem>
                            <SelectItem value="outline">Outline</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2 space-y-1.5">
                        <Label>Destination link</Label>
                        <Input value={btn.link}
                          placeholder="/shop or /shop?category=Coastal+Posters or https://example.com"
                          onChange={e => {
                            const btns = [...(hero.extraButtons ?? [])];
                            btns[bIdx] = { ...btns[bIdx], link: e.target.value };
                            setHero({ extraButtons: btns });
                          }} />
                      </div>
                    </div>
                    {/* Per-button color overrides */}
                    <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border/50">
                      <ColorField
                        label="Text color"
                        value={btn.style?.textColor}
                        onChange={v => {
                          const btns = [...(hero.extraButtons ?? [])];
                          btns[bIdx] = { ...btns[bIdx], style: { ...btns[bIdx].style, textColor: v } };
                          setHero({ extraButtons: btns });
                        }}
                      />
                      <ColorField
                        label="Background"
                        value={btn.style?.backgroundColor}
                        onChange={v => {
                          const btns = [...(hero.extraButtons ?? [])];
                          btns[bIdx] = { ...btns[bIdx], style: { ...btns[bIdx].style, backgroundColor: v } };
                          setHero({ extraButtons: btns });
                        }}
                      />
                      <ColorField
                        label="Border"
                        value={btn.style?.borderColor}
                        onChange={v => {
                          const btns = [...(hero.extraButtons ?? [])];
                          btns[bIdx] = { ...btns[bIdx], style: { ...btns[bIdx].style, borderColor: v } };
                          setHero({ extraButtons: btns });
                        }}
                      />
                    </div>
                    {/* Per-button mobile/desktop visibility */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <p className="text-xs">Show on mobile</p>
                        <Switch
                          checked={btn.showMobile !== false}
                          onCheckedChange={v => {
                            const btns = [...(hero.extraButtons ?? [])];
                            btns[bIdx] = { ...btns[bIdx], showMobile: v ? undefined : false };
                            setHero({ extraButtons: btns });
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <p className="text-xs">Show on desktop</p>
                        <Switch
                          checked={btn.showDesktop !== false}
                          onCheckedChange={v => {
                            const btns = [...(hero.extraButtons ?? [])];
                            btns[bIdx] = { ...btns[bIdx], showDesktop: v ? undefined : false };
                            setHero({ extraButtons: btns });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trust badges */}
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <Label>Trust badges</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Short labels shown below the hero buttons. Defaults: {DEFAULT_TRUST_BADGE_TEXTS.join(" · ")}.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
                    onClick={() => {
                      const newBadge: HeroTrustBadge = { id: `badge-${Date.now()}`, text: "" };
                      const current = hero.trustBadges && hero.trustBadges.length > 0
                        ? hero.trustBadges
                        : DEFAULT_TRUST_BADGE_TEXTS.map((t, i) => ({ id: `default-${i}`, text: t }));
                      setHero({ trustBadges: [...current, newBadge] });
                    }}>
                    <Plus className="w-3.5 h-3.5" />
                    Add badge
                  </Button>
                </div>
                {(!hero.trustBadges || hero.trustBadges.length === 0) ? (
                  <p className="text-xs text-muted-foreground italic">
                    Using defaults: {DEFAULT_TRUST_BADGE_TEXTS.join(" · ")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {hero.trustBadges.map((badge, bIdx) => (
                      <div key={badge.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
                        <Input
                          value={badge.text}
                          placeholder={DEFAULT_TRUST_BADGE_TEXTS[bIdx] ?? "Fine art prints"}
                          className="h-8 text-sm flex-1"
                          onChange={e => {
                            const badges = [...(hero.trustBadges ?? [])];
                            badges[bIdx] = { ...badges[bIdx], text: e.target.value };
                            setHero({ trustBadges: badges });
                          }}
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">Mobile</span>
                          <Switch
                            checked={badge.showMobile !== false}
                            onCheckedChange={v => {
                              const badges = [...(hero.trustBadges ?? [])];
                              badges[bIdx] = { ...badges[bIdx], showMobile: v ? undefined : false };
                              setHero({ trustBadges: badges });
                            }}
                          />
                        </div>
                        <button type="button"
                          onClick={() => setHero({ trustBadges: (hero.trustBadges ?? []).filter((_, i) => i !== bIdx) })}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove badge">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => setHero({ trustBadges: undefined })}>
                      Reset to defaults
                    </button>
                  </div>
                )}
              </div>

              {/* Hero visual overrides */}
              <CollapsibleOverridePanel title="Hero visual overrides">
                <div className="grid grid-cols-2 gap-3">
                  <FontField
                    label="Heading font"
                    value={heroSection?.fontOverrides?.headingFont}
                    onChange={v => updateSectionOverrides("hero", "fontOverrides", { headingFont: v })}
                  />
                  <FontField
                    label="Body font"
                    value={heroSection?.fontOverrides?.bodyFont}
                    onChange={v => updateSectionOverrides("hero", "fontOverrides", { bodyFont: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    label="Heading color"
                    value={heroSection?.colorOverrides?.headingColor}
                    onChange={v => updateSectionOverrides("hero", "colorOverrides", { headingColor: v })}
                  />
                  <ColorField
                    label="Text / subtitle color"
                    value={heroSection?.colorOverrides?.textColor}
                    onChange={v => updateSectionOverrides("hero", "colorOverrides", { textColor: v })}
                  />
                  <ColorField
                    label="Background color fallback"
                    value={heroSection?.colorOverrides?.backgroundColor}
                    onChange={v => updateSectionOverrides("hero", "colorOverrides", { backgroundColor: v })}
                  />
                  <ColorField
                    label="Overlay color"
                    value={heroSection?.colorOverrides?.overlayColor}
                    onChange={v => updateSectionOverrides("hero", "colorOverrides", { overlayColor: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Overlay opacity — {Math.round((heroSection?.colorOverrides?.overlayOpacity ?? 0) * 100)}%
                    {heroSection?.colorOverrides?.overlayOpacity == null && (
                      <span className="ml-1.5 text-muted-foreground font-normal">(using slider above)</span>
                    )}
                  </Label>
                  <Slider
                    min={0} max={100} step={5}
                    value={[Math.round((heroSection?.colorOverrides?.overlayOpacity ?? 0) * 100)]}
                    onValueChange={([v]) =>
                      updateSectionOverrides("hero", "colorOverrides", { overlayOpacity: v === 0 ? null : v / 100 } as Partial<SectionColorOverrides>)
                    }
                  />
                  <p className="text-xs text-muted-foreground">Set to override the overlay slider above. 0% = not set.</p>
                </div>
              </CollapsibleOverridePanel>
            </SectionCard>

            {/* ── Featured posters visual overrides ──────────────────── */}
            <SectionCard
              title="Featured posters"
              description="Visual overrides for the Featured posters section heading and card text. Does not affect shop cards or product pages."
            >
              <CollapsibleOverridePanel title="Featured posters visual overrides">
                <div className="grid grid-cols-2 gap-3">
                  <FontField
                    label="Heading font"
                    value={featuredSection?.fontOverrides?.headingFont}
                    onChange={v => updateSectionOverrides("featuredPosters", "fontOverrides", { headingFont: v })}
                  />
                  <ColorField
                    label="Heading color"
                    value={featuredSection?.colorOverrides?.headingColor}
                    onChange={v => updateSectionOverrides("featuredPosters", "colorOverrides", { headingColor: v })}
                  />
                  <ColorField
                    label="View all link color"
                    value={featuredSection?.colorOverrides?.linkColor}
                    onChange={v => updateSectionOverrides("featuredPosters", "colorOverrides", { linkColor: v })}
                  />
                  <ColorField
                    label="Poster title color"
                    value={featuredSection?.colorOverrides?.posterTitleColor}
                    onChange={v => updateSectionOverrides("featuredPosters", "colorOverrides", { posterTitleColor: v })}
                  />
                  <ColorField
                    label="Poster price color"
                    value={featuredSection?.colorOverrides?.posterPriceColor}
                    onChange={v => updateSectionOverrides("featuredPosters", "colorOverrides", { posterPriceColor: v })}
                  />
                </div>
              </CollapsibleOverridePanel>
            </SectionCard>

            {/* ── New arrivals visual overrides ───────────────────────── */}
            <SectionCard
              title="New arrivals"
              description="Visual overrides for the New arrivals section heading and card text. Does not affect shop cards or product pages."
            >
              <CollapsibleOverridePanel title="New arrivals visual overrides">
                <div className="grid grid-cols-2 gap-3">
                  <FontField
                    label="Heading font"
                    value={newArrivalsSection?.fontOverrides?.headingFont}
                    onChange={v => updateSectionOverrides("newArrivals", "fontOverrides", { headingFont: v })}
                  />
                  <ColorField
                    label="Heading color"
                    value={newArrivalsSection?.colorOverrides?.headingColor}
                    onChange={v => updateSectionOverrides("newArrivals", "colorOverrides", { headingColor: v })}
                  />
                  <ColorField
                    label="View all link color"
                    value={newArrivalsSection?.colorOverrides?.linkColor}
                    onChange={v => updateSectionOverrides("newArrivals", "colorOverrides", { linkColor: v })}
                  />
                  <ColorField
                    label="Poster title color"
                    value={newArrivalsSection?.colorOverrides?.posterTitleColor}
                    onChange={v => updateSectionOverrides("newArrivals", "colorOverrides", { posterTitleColor: v })}
                  />
                  <ColorField
                    label="Poster price color"
                    value={newArrivalsSection?.colorOverrides?.posterPriceColor}
                    onChange={v => updateSectionOverrides("newArrivals", "colorOverrides", { posterPriceColor: v })}
                  />
                </div>
              </CollapsibleOverridePanel>
            </SectionCard>

            {/* ── Brand story visual overrides ────────────────────────── */}
            <SectionCard
              title="Brand story"
              description="Visual overrides for the Brand story quote section."
            >
              <CollapsibleOverridePanel title="Brand story visual overrides">
                <div className="grid grid-cols-2 gap-3">
                  <FontField
                    label="Font"
                    value={brandStorySection?.fontOverrides?.bodyFont ?? brandStorySection?.fontOverrides?.headingFont}
                    onChange={v => updateSectionOverrides("brandStory", "fontOverrides", { bodyFont: v })}
                  />
                  <ColorField
                    label="Text / quote color"
                    value={brandStorySection?.colorOverrides?.textColor}
                    onChange={v => updateSectionOverrides("brandStory", "colorOverrides", { textColor: v })}
                  />
                  <ColorField
                    label="Background color"
                    value={brandStorySection?.colorOverrides?.backgroundColor}
                    onChange={v => updateSectionOverrides("brandStory", "colorOverrides", { backgroundColor: v })}
                  />
                </div>
              </CollapsibleOverridePanel>
            </SectionCard>

            {/* ── Collection banners ────────────────────────────────────── */}
            {orderedBannerSections.length > 0 && (
              <div className="space-y-4">
                <h2 className="font-semibold text-base px-0.5">Collection banners</h2>
                {orderedBannerSections.map((section, idx) => {
                  const bannerId = section.bannerId;
                  if (!bannerId) return null;
                  const banner = bannerById[bannerId];
                  if (!banner) return null;
                  return (
                    <CollectionBannerEditor
                      key={bannerId}
                      banner={banner}
                      bannerLabel={`Collection banner ${idx + 1}${banner.title ? ` · ${banner.title}` : ""}`}
                      totalBanners={orderedBannerSections.length}
                      onUpdate={(patch) => updateBanner(bannerId, patch)}
                      onDuplicate={() => duplicateBanner(bannerId)}
                      onRemove={() => removeBanner(bannerId)}
                    />
                  );
                })}
              </div>
            )}

            {/* ── Save / Preview ───────────────────────────────────────── */}
            <div className="flex gap-3 pt-1">
              <Button onClick={handleSave} disabled={saving || previewing} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button onClick={handlePreview} disabled={saving || previewing} variant="outline" className="gap-1.5">
                {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {previewing ? "Opening preview…" : "Preview"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminDashboardLayout>
  );
}
