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
  type CollectionBannerVisualConfig,
  type HomepageSectionConfig,
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
          <ImageUploader
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

          {/* Font/color override placeholder */}
          <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
            Section-level font and color overrides are planned for next phase.
          </p>
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

  // ── Section operations ────────────────────────────────────────────────────

  const updateSections = useCallback((updater: (prev: HomepageSectionConfig[]) => HomepageSectionConfig[]) => {
    setConfig(c => {
      const prev = c.sections && c.sections.length > 0 ? [...c.sections] : [...DEFAULT_HOMEPAGE_SECTIONS];
      return { ...c, sections: normalizeSortOrders(updater(prev)) };
    });
  }, []);

  const moveSectionUp = (id: string) => {
    setConfig(c => {
      const sections = normalizeSortOrders(
        c.sections && c.sections.length > 0 ? [...c.sections] : [...DEFAULT_HOMEPAGE_SECTIONS]
      );
      const idx = sections.findIndex(s => s.id === id);
      if (idx <= 0) return c;
      // Swap the sortOrder values so normalizeSortOrders re-sorts correctly
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
      // Swap the sortOrder values so normalizeSortOrders re-sorts correctly
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
      // Rebuild default sections, preserving existing visibility flags
      const defaultSections: HomepageSectionConfig[] = DEFAULT_HOMEPAGE_SECTIONS.map(def => {
        const existing = existingSections.find(s => s.id === def.id);
        return { ...def, visible: existing !== undefined ? existing.visible : def.visible };
      });
      // Preserve any custom collection banner sections not in the defaults
      const customBannerSections = existingSections.filter(
        s => !defaultIds.has(s.id) && s.type === "collectionBanner"
      );
      return { ...c, sections: normalizeSortOrders([...defaultSections, ...customBannerSections]) };
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
      // Navigate to the store's public root so URL-based store resolution works.
      // If the store has a route prefix (e.g. /sweden) use that; otherwise root /.
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
      // Re-apply migration on the returned config
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

  // Banners that appear in the section list, in section order
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
                      {/* Visibility toggle */}
                      <button type="button"
                        onClick={() => toggleSectionVisible(section.id)}
                        className={cn(
                          "shrink-0 p-1 rounded transition-colors",
                          section.visible ? "text-foreground/70 hover:text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
                        )}
                        title={section.visible ? "Hide section" : "Show section"}>
                        {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>

                      {/* Label */}
                      <span className={cn("flex-1 text-sm font-medium", !section.visible && "text-muted-foreground/60")}>
                        {label}
                      </span>

                      {/* Up/down */}
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
                      This will reorder sections but will not delete your collection banners or their content.
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Primary button text</Label>
                  <Input value={hero.primaryButtonText ?? ""} placeholder="Browse posters"
                    onChange={e => setHero({ primaryButtonText: e.target.value || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Primary button style</Label>
                  <Select value={hero.primaryButtonVariant ?? "filled"}
                    onValueChange={v => setHero({ primaryButtonVariant: v as "filled" | "outline" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Primary button link</Label>
                  <Input value={hero.primaryButtonLink ?? ""} placeholder="/shop"
                    onChange={e => setHero({ primaryButtonLink: e.target.value || null })} />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to default to /shop. Examples: /shop?category=Coastal+Posters, /about, https://example.com
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary button text</Label>
                  <Input value={hero.secondaryButtonText ?? ""} placeholder="View all regions"
                    onChange={e => setHero({ secondaryButtonText: e.target.value || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary button style</Label>
                  <Select value={hero.secondaryButtonVariant ?? "outline"}
                    onValueChange={v => setHero({ secondaryButtonVariant: v as "filled" | "outline" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary button link</Label>
                  <Input value={hero.secondaryButtonLink ?? ""} placeholder="/shop?region=Andalusia"
                    onChange={e => setHero({ secondaryButtonLink: e.target.value || null })} />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to default to /shop.
                  </p>
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
                  </div>
                ))}
              </div>
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
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={saving || previewing}
                className="gap-1.5"
              >
                {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {previewing ? "Opening…" : "Preview"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminDashboardLayout>
  );
}
