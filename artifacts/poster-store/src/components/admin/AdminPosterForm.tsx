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
import { AdminImageFields } from "./AdminImageFields";
import { AdminSizePriceEditor } from "./AdminSizePriceEditor";
import { AdminPublishControls } from "./AdminPublishControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { storefronts } from "@/config/storefronts";
import { Save, ArrowLeft, Loader2 } from "lucide-react";

interface AdminPosterFormProps {
  existing?: AdminPoster;
}

function buildPublishBlockReasons(fields: {
  title: string;
  imageUrl: string;
  category: string;
  price: string;
}): string[] {
  const reasons: string[] = [];
  if (!fields.title.trim()) reasons.push("Title is required");
  if (!fields.imageUrl.trim()) reasons.push("Image URL is required");
  if (!fields.category.trim()) reasons.push("Category is required");
  if (!fields.price || isNaN(Number(fields.price)) || Number(fields.price) <= 0)
    reasons.push("A valid price is required");
  return reasons;
}

export const AdminPosterForm = ({ existing }: AdminPosterFormProps) => {
  const { token, adminStoreKey } = useAdminToken();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const activeStore = storefronts[adminStoreKey] ?? storefronts["postsofspain"];

  const [storeKey] = useState(existing?.storeKey ?? adminStoreKey);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [region, setRegion] = useState(existing?.region ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [tagsInput, setTagsInput] = useState((existing?.tags ?? []).join(", "));
  const [price, setPrice] = useState(String(existing?.price ?? ""));
  const [currency, setCurrency] = useState(existing?.currency ?? activeStore.defaultCurrency ?? "EUR");
  const [sizes, setSizes] = useState<string[]>(existing?.sizes ?? []);
  const [status, setStatus] = useState<PosterStatus>((existing?.status as PosterStatus) ?? "draft");
  const [isFeatured, setIsFeatured] = useState(existing?.isFeatured ?? false);
  const [isNew, setIsNew] = useState(existing?.isNew ?? false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const publishBlockReasons = buildPublishBlockReasons({ title, imageUrl, category, price });
  const canPublish = publishBlockReasons.length === 0;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    if (!imageUrl.trim()) errs.imageUrl = "Image URL is required";
    if (!category.trim()) errs.category = "Category is required";
    if (!price || isNaN(Number(price)) || Number(price) <= 0) errs.price = "Valid price is required";
    if (status === "published" && !canPublish) {
      errs.status = "Cannot publish: fix the above errors first";
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (!token) return;

    setSaving(true);
    const tags = tagsInput
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

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
          price: Number(price),
          currency,
          sizes: sizes.length ? sizes : undefined,
          status,
          isFeatured,
          isNew,
        };
        await adminUpdatePoster(token, existing.id, storeKey, payload);
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
          price: Number(price),
          currency,
          sizes: sizes.length ? sizes : undefined,
          status,
          isFeatured,
          isNew,
        };
        const created = await adminCreatePoster(token, payload);
        toast({ title: "Poster created", description: title });
        setLocation(`/admin/posters/${created.id}`);
        return;
      }
    } catch (err: any) {
      toast({
        title: existing ? "Update failed" : "Create failed",
        description: err?.message ?? "Unknown error",
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Price <span className="text-destructive">*</span></Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={e => { setPrice(e.target.value); setErrors(p => ({ ...p, price: "" })); }}
                    placeholder="0.00"
                    data-testid="field-price"
                  />
                  {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger data-testid="field-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="SEK">SEK</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Images</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminImageFields imageUrl={imageUrl} onImageUrlChange={v => { setImageUrl(v); setErrors(p => ({ ...p, imageUrl: "" })); }} />
              {errors.imageUrl && <p className="text-xs text-destructive mt-1">{errors.imageUrl}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sizes</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminSizePriceEditor sizes={sizes} onSizesChange={setSizes} />
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
