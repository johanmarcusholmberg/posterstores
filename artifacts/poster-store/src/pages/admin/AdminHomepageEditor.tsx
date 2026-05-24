import React, { useState, useRef, useEffect, useCallback } from "react";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminGetHomepageVisual,
  adminUpdateHomepageVisual,
  requestStorageUploadUrl,
  type HomepageVisualConfig,
  type HeroVisualConfig,
  type CollectionBannerVisualConfig,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Loader2, Save, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

async function uploadImageFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ url: string; storagePath: string }> {
  const meta = await requestStorageUploadUrl(file.name, file.size, file.type);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.open("PUT", meta.uploadURL);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });

  return { url: `/api/storage${meta.objectPath}`, storagePath: meta.objectPath };
}

interface ImageUploaderProps {
  label: string;
  hint?: string;
  currentUrl?: string | null;
  onUpload: (url: string, storagePath: string) => void;
  onRemove: () => void;
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `File type not supported ("${file.type}"). Please upload a JPG, PNG, or WebP image.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 8 MB.`;
  }
  return null;
}

function ImageUploader({ label, hint, currentUrl, onUpload, onRemove }: ImageUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (file: File) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setUploading(true);
    setUploadError("");
    setProgress(0);
    try {
      const { url, storagePath } = await uploadImageFile(file, setProgress);
      onUpload(url, storagePath);
    } catch (err: unknown) {
      setUploadError((err as Error)?.message ?? "Upload failed");
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
          <img
            src={displayUrl}
            alt={label}
            className="w-full max-h-52 object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-white text-sm font-semibold">{progress}%</div>
            </div>
          )}
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="bg-background/90 rounded-md p-1.5 hover:bg-background shadow-sm border border-border"
                title="Replace image"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setLocalPreview(null); onRemove(); }}
                className="bg-background/90 rounded-md p-1.5 hover:bg-background shadow-sm border border-border text-destructive"
                title="Remove image"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={cn(
            "w-full border-2 border-dashed border-border rounded-md py-10 flex flex-col items-center gap-2 text-muted-foreground transition-colors",
            uploading ? "opacity-50 cursor-not-allowed" : "hover:border-primary/40 hover:text-primary cursor-pointer"
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">{progress}%</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-5 h-5" />
              <span className="text-sm font-medium">Click to upload background image</span>
              <span className="text-xs opacity-70">JPG, PNG, WebP — recommended 1920×600 or wider</span>
            </>
          )}
        </button>
      )}

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="border-b border-border pb-3">
        <h2 className="font-semibold text-base">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function AdminHomepageEditor() {
  const { adminStoreKey } = useAdminToken();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [config, setConfig] = useState<HomepageVisualConfig>({ hero: {}, collectionBanner: {} });

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    adminGetHomepageVisual(adminStoreKey)
      .then((data) => setConfig({ hero: {}, collectionBanner: {}, ...data }))
      .catch((e) => setError(e?.message ?? "Failed to load homepage config"))
      .finally(() => setLoading(false));
  }, [adminStoreKey]);

  useEffect(() => { load(); }, [load]);

  const setHero = (patch: Partial<HeroVisualConfig>) =>
    setConfig((c) => ({ ...c, hero: { ...c.hero, ...patch } }));

  const setCollection = (patch: Partial<CollectionBannerVisualConfig>) =>
    setConfig((c) => ({ ...c, collectionBanner: { ...c.collectionBanner, ...patch } }));

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await adminUpdateHomepageVisual(adminStoreKey, config);
      setConfig({ hero: {}, collectionBanner: {}, ...saved });
      setSuccess("Saved successfully. Changes are live on the homepage.");
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const hero = config.hero ?? {};
  const collection = config.collectionBanner ?? {};

  const heroOverlay = Math.round((hero.backgroundOverlayOpacity ?? 0.3) * 100);
  const collOverlay = Math.round((collection.backgroundOverlayOpacity ?? 0.35) * 100);

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
            {/* ── Hero section ─────────────────────────────────────────── */}
            <SectionCard
              title="Hero section"
              description="The intro banner at the top of the homepage."
            >
              <ImageUploader
                label="Background image"
                hint="Appears behind the title and subtitle. Leave empty for the default warm sand background."
                currentUrl={hero.backgroundImageUrl}
                onUpload={(url, storagePath) =>
                  setHero({ backgroundImageUrl: url, backgroundStoragePath: storagePath })
                }
                onRemove={() =>
                  setHero({ backgroundImageUrl: null, backgroundStoragePath: null })
                }
              />

              {hero.backgroundImageUrl && (
                <div className="space-y-1.5">
                  <Label>
                    Overlay darkness — {heroOverlay}%
                  </Label>
                  <Slider
                    min={0}
                    max={80}
                    step={5}
                    value={[heroOverlay]}
                    onValueChange={([v]) => setHero({ backgroundOverlayOpacity: v / 100 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    A darker overlay makes the white text more readable over bright images.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Primary button text</Label>
                  <Input
                    value={hero.primaryButtonText ?? ""}
                    onChange={(e) => setHero({ primaryButtonText: e.target.value || null })}
                    placeholder="Browse posters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Primary button style</Label>
                  <Select
                    value={hero.primaryButtonVariant ?? "filled"}
                    onValueChange={(v) =>
                      setHero({ primaryButtonVariant: v as "filled" | "outline" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary button text</Label>
                  <Input
                    value={hero.secondaryButtonText ?? ""}
                    onChange={(e) =>
                      setHero({ secondaryButtonText: e.target.value || null })
                    }
                    placeholder="View all regions"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary button style</Label>
                  <Select
                    value={hero.secondaryButtonVariant ?? "outline"}
                    onValueChange={(v) =>
                      setHero({ secondaryButtonVariant: v as "filled" | "outline" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>

            {/* ── Collection banner ─────────────────────────────────────── */}
            <SectionCard
              title="Collection banner"
              description="The editorial section below the featured posters row."
            >
              <ImageUploader
                label="Background image"
                hint="Fills the banner background. Leave empty for the default warm sand tone."
                currentUrl={collection.backgroundImageUrl}
                onUpload={(url, storagePath) =>
                  setCollection({
                    backgroundImageUrl: url,
                    backgroundStoragePath: storagePath,
                  })
                }
                onRemove={() =>
                  setCollection({ backgroundImageUrl: null, backgroundStoragePath: null })
                }
              />

              {collection.backgroundImageUrl && (
                <div className="space-y-1.5">
                  <Label>Overlay darkness — {collOverlay}%</Label>
                  <Slider
                    min={0}
                    max={80}
                    step={5}
                    value={[collOverlay]}
                    onValueChange={([v]) =>
                      setCollection({ backgroundOverlayOpacity: v / 100 })
                    }
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Eyebrow text</Label>
                  <Input
                    value={collection.eyebrow ?? ""}
                    onChange={(e) =>
                      setCollection({ eyebrow: e.target.value || null })
                    }
                    placeholder="COLLECTION"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={collection.title ?? ""}
                    onChange={(e) => setCollection({ title: e.target.value || null })}
                    placeholder="Mediterranean Walls"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={collection.text ?? ""}
                  onChange={(e) => setCollection({ text: e.target.value || null })}
                  placeholder="Warm-toned prints inspired by Spanish streets, terraces and coastlines."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>CTA button text</Label>
                  <Input
                    value={collection.ctaText ?? ""}
                    onChange={(e) =>
                      setCollection({ ctaText: e.target.value || null })
                    }
                    placeholder="Explore coastal posters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CTA link</Label>
                  <Input
                    value={collection.ctaLink ?? ""}
                    onChange={(e) =>
                      setCollection({ ctaLink: e.target.value || null })
                    }
                    placeholder="/shop?category=Coastal+Posters"
                  />
                </div>
              </div>
            </SectionCard>

            <div className="flex gap-3 pt-1">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminDashboardLayout>
  );
}
