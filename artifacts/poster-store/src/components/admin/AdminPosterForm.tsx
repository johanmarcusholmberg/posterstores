import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminCreatePoster,
  adminUpdatePoster,
  type AdminPoster,
  type CreatePosterPayload,
  type UpdatePosterPayload,
  type PosterStatus,
} from "@/lib/adminApi";
import { getPosterMockups, type PosterMockup } from "@/lib/mockupApi";
import { AdminImageFields } from "./AdminImageFields";
import { AdminSizePriceEditor, type SizeRow, buildDefaultSizeRows } from "./AdminSizePriceEditor";
import { AdminMockupEditor } from "./AdminMockupEditor";
import { AdminPublishControls } from "./AdminPublishControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { storefronts } from "@/config/storefronts";
import { Save, ArrowLeft, Loader2, RefreshCw } from "lucide-react";

interface AdminPosterFormProps {
  existing?: AdminPoster;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateSizes(sizes: SizeRow[], status: PosterStatus): string[] {
  const errors: string[] = [];
  const activeSizes = sizes.filter(s => s.active);

  if (status === "published" && activeSizes.length === 0) {
    errors.push("At least one active size is required to publish");
  }

  activeSizes.forEach((s, i) => {
    const idx = sizes.indexOf(s);
    if (!s.sizeLabel.trim()) errors.push(`Size ${idx + 1}: label is required`);
    if (s.price == null || s.price <= 0) errors.push(`Size ${idx + 1} (${s.sizeLabel || "unnamed"}): price must be positive`);
    if (!s.currency) errors.push(`Size ${idx + 1}: currency is required`);
  });

  return errors;
}

function buildPublishBlockReasons(fields: {
  title: string;
  imageUrl: string;
  category: string;
  slug: string;
  sizes: SizeRow[];
}): string[] {
  const reasons: string[] = [];
  if (!fields.title.trim()) reasons.push("Title is required");
  if (!fields.imageUrl.trim()) reasons.push("Image URL is required");
  if (!fields.category.trim()) reasons.push("Category is required");
  if (!fields.slug.trim()) reasons.push("Slug is required before publishing");
  else if (!SLUG_REGEX.test(fields.slug)) reasons.push("Slug format is invalid");
  const activeSizes = fields.sizes.filter(s => s.active);
  if (activeSizes.length === 0) reasons.push("At least one active size with price is required");
  else {
    const invalidActive = activeSizes.some(s => !s.sizeLabel.trim() || s.price == null || s.price <= 0);
    if (invalidActive) reasons.push("All active sizes must have a label and positive price");
  }
  return reasons;
}

function posterSizesToSizeRows(poster: AdminPoster, defaultCurrency: string): SizeRow[] {
  if (poster.posterSizes && poster.posterSizes.length > 0) {
    return poster.posterSizes.map((s, idx) => ({
      sizeLabel: s.sizeLabel,
      price: s.price,
      currency: s.currency,
      active: s.active,
      sortOrder: s.sortOrder ?? idx,
    }));
  }
  return [];
}

export const AdminPosterForm = ({ existing }: AdminPosterFormProps) => {
  const { adminStoreKey } = useAdminToken();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const activeStore = storefronts[adminStoreKey] ?? storefronts["postsofspain"];
  const defaultCurrency = activeStore.defaultCurrency ?? "EUR";

  const [storeKey] = useState(existing?.storeKey ?? adminStoreKey);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!existing?.slug);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [region, setRegion] = useState(existing?.region ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [tagsInput, setTagsInput] = useState((existing?.tags ?? []).join(", "));
  const [status, setStatus] = useState<PosterStatus>((existing?.status as PosterStatus) ?? "draft");
  const [isFeatured, setIsFeatured] = useState(existing?.isFeatured ?? false);
  const [isNew, setIsNew] = useState(existing?.isNew ?? false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sizeErrors, setSizeErrors] = useState<string[]>([]);
  const [mockups, setMockups] = useState<PosterMockup[]>([]);

  const [sizes, setSizes] = useState<SizeRow[]>(() => {
    if (existing) return posterSizesToSizeRows(existing, defaultCurrency);
    return buildDefaultSizeRows(defaultCurrency);
  });

  useEffect(() => {
    if (!existing) return;
    getPosterMockups(existing.id, existing.storeKey)
      .then(setMockups)
      .catch(() => setMockups([]));
  }, [existing?.id]);

  useEffect(() => {
    if (!slugManuallyEdited && !existing) {
      setSlug(generateSlugFromTitle(title));
    }
  }, [title, slugManuallyEdited, existing]);

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setSlug(value);
    setErrors(p => ({ ...p, slug: "" }));
  };

  const handleRegenerateSlug = () => {
    const generated = generateSlugFromTitle(title);
    setSlug(generated);
    setSlugManuallyEdited(false);
    setErrors(p => ({ ...p, slug: "" }));
  };

  const publishBlockReasons = buildPublishBlockReasons({ title, imageUrl, category, slug, sizes });
  const canPublish = publishBlockReasons.length === 0;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    if (!imageUrl.trim()) errs.imageUrl = "Image URL is required";
    if (!category.trim()) errs.category = "Category is required";

    if (slug.trim() && !SLUG_REGEX.test(slug.trim())) {
      errs.slug = "Slug must be lowercase, URL-safe (letters, numbers, hyphens only), and cannot start or end with a hyphen";
    }

    const sizeErrs = validateSizes(sizes, status);
    setSizeErrors(sizeErrs);

    if (status === "published" && !canPublish) {
      errs.status = "Cannot publish: fix the above errors first";
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    const currentSizeErrors = validateSizes(sizes, status);
    setSizeErrors(currentSizeErrors);
    if (Object.keys(errs).length > 0 || currentSizeErrors.length > 0) return;

    setSaving(true);
    const tags = tagsInput
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    const lowestActiveSize = sizes.filter(s => s.active && s.price != null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
    const legacyPrice = lowestActiveSize?.price ?? 0;
    const legacyCurrency = lowestActiveSize?.currency ?? defaultCurrency;
    const legacySizes = sizes.map(s => s.sizeLabel).filter(Boolean);

    const posterSizesPayload = sizes.map((s, idx) => ({
      sizeLabel: s.sizeLabel,
      price: s.price ?? 0,
      currency: s.currency,
      active: s.active,
      sortOrder: idx,
    }));

    const slugValue = slug.trim() || undefined;

    try {
      if (existing) {
        const payload: UpdatePosterPayload = {
          title,
          description: description || undefined,
          imageUrl,
          category,
          region: region || undefined,
          city: city || undefined,
          tags: tags.length ? tags : undefined,
          price: legacyPrice,
          currency: legacyCurrency,
          sizes: legacySizes.length ? legacySizes : undefined,
          posterSizes: posterSizesPayload,
          status,
          isFeatured,
          isNew,
          slug: slugValue,
        };
        await adminUpdatePoster(existing.id, storeKey, payload);
        toast({ title: "Poster updated", description: title });
      } else {
        const payload: CreatePosterPayload = {
          storeKey,
          title,
          description: description || undefined,
          imageUrl,
          category,
          region: region || undefined,
          city: city || undefined,
          tags: tags.length ? tags : undefined,
          price: legacyPrice,
          currency: legacyCurrency,
          sizes: legacySizes.length ? legacySizes : undefined,
          posterSizes: posterSizesPayload,
          status,
          isFeatured,
          isNew,
          slug: slugValue,
        };
        const created = await adminCreatePoster(payload);
        toast({ title: "Poster created", description: title });
        setLocation(`/admin/posters/${created.id}`);
        return;
      }
    } catch (err: any) {
      const message: string = err?.message ?? "Unknown error";
      if (message.toLowerCase().includes("slug")) {
        setErrors(p => ({ ...p, slug: message }));
      }
      toast({
        title: existing ? "Update failed" : "Create failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const storefront = storefronts[storeKey];
  const categories = storefront?.categories ?? [];
  const regions = storefront?.regions ?? [];
  const cities = storefront?.cities ?? [];
  const tags = storefront?.tags ?? [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setLocation("/admin/posters")}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to posters
        </Button>
        <Button type="submit" disabled={saving} className="gap-1.5" data-testid="save-poster-btn">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {existing ? "Save changes" : "Create poster"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Poster details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
                <Input
                  id="title"
                  value={title}
                  onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: "" })); }}
                  placeholder="e.g. Valencia Sunset"
                  data-testid="field-title"
                />
                {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">
                  URL Slug <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    placeholder="e.g. valencia-sunset"
                    className="font-mono text-sm"
                    data-testid="field-slug"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleRegenerateSlug}
                    title="Regenerate from title"
                    data-testid="btn-regenerate-slug"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used in the public product URL: <span className="font-mono">/posters/{slug || "your-slug-here"}</span>. Must be unique within the selected store.
                </p>
                {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                  data-testid="field-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  {categories.length > 0 ? (
                    <Select value={category} onValueChange={v => { setCategory(v); setErrors(p => ({ ...p, category: "" })); }}>
                      <SelectTrigger data-testid="field-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={category}
                      onChange={e => { setCategory(e.target.value); setErrors(p => ({ ...p, category: "" })); }}
                      placeholder="Category"
                      data-testid="field-category"
                    />
                  )}
                  {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="storeKey">Store</Label>
                  <Input id="storeKey" value={storeKey} disabled className="bg-muted/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Region</Label>
                  {regions.length > 0 ? (
                    <Select value={region || "__none__"} onValueChange={v => setRegion(v === "__none__" ? "" : v)}>
                      <SelectTrigger data-testid="field-region">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={region} onChange={e => setRegion(e.target.value)} placeholder="Region" data-testid="field-region" />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>City</Label>
                  {cities.length > 0 ? (
                    <Select value={city || "__none__"} onValueChange={v => setCity(v === "__none__" ? "" : v)}>
                      <SelectTrigger data-testid="field-city">
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" data-testid="field-city" />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags</Label>
                {tags.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {tags.map(t => {
                        const selected = tagsInput.split(",").map(x => x.trim()).includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              const arr = tagsInput.split(",").map(x => x.trim()).filter(Boolean);
                              if (selected) {
                                setTagsInput(arr.filter(x => x !== t).join(", "));
                              } else {
                                setTagsInput([...arr, t].join(", "));
                              }
                            }}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              selected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border hover:border-primary"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      id="tags"
                      value={tagsInput}
                      onChange={e => setTagsInput(e.target.value)}
                      placeholder="Or type custom tags, comma-separated"
                      className="text-sm"
                      data-testid="field-tags"
                    />
                  </div>
                ) : (
                  <Input
                    id="tags"
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    placeholder="Comma-separated tags"
                    data-testid="field-tags"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Poster image</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminImageFields imageUrl={imageUrl} onImageUrlChange={v => { setImageUrl(v); setErrors(p => ({ ...p, imageUrl: "" })); }} />
              {errors.imageUrl && <p className="text-xs text-destructive mt-1">{errors.imageUrl}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mockup images</CardTitle>
            </CardHeader>
            <CardContent>
              {existing ? (
                <AdminMockupEditor
                  posterId={existing.id}
                  storeKey={existing.storeKey}
                  mockups={mockups}
                  onMockupsChange={setMockups}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Save the poster first, then you can add mockup images.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sizes &amp; Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminSizePriceEditor
                sizes={sizes}
                defaultCurrency={defaultCurrency}
                onSizesChange={newSizes => {
                  setSizes(newSizes);
                  setSizeErrors([]);
                }}
                errors={sizeErrors}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publishing</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminPublishControls
                status={status}
                isFeatured={isFeatured}
                isNew={isNew}
                onStatusChange={setStatus}
                onFeaturedChange={setIsFeatured}
                onNewChange={setIsNew}
                canPublish={canPublish}
                publishBlockReasons={publishBlockReasons}
              />
              {errors.status && <p className="text-xs text-destructive mt-2">{errors.status}</p>}
            </CardContent>
          </Card>

          {slug && (
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Public URL preview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono text-muted-foreground break-all">/posters/{slug}</p>
              </CardContent>
            </Card>
          )}

          {sizes.filter(s => s.active).length > 0 && (
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Active sizes preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {sizes.filter(s => s.active).map((s, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-foreground">{s.sizeLabel || "—"}</span>
                    <span className="font-medium text-foreground">
                      {s.price != null ? `${s.price.toFixed(2)} ${s.currency}` : <span className="text-muted-foreground text-xs">no price</span>}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="sticky top-20">
            <Button
              type="submit"
              disabled={saving}
              className="w-full gap-1.5"
              data-testid="save-poster-btn-sidebar"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {existing ? "Save changes" : "Create poster"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};
