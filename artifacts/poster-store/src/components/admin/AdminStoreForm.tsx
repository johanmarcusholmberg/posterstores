import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminCreateStore,
  adminUpdateStore,
  type AdminStore,
  type CreateStorePayload,
  type UpdateStorePayload,
  type AdminStoreThemeConfig,
  type AdminStoreHomepageConfig,
  type AdminStoreSeoConfig,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const STORE_KEY_RE = /^[a-z][a-z0-9]*$/;

const DEFAULT_THEME: AdminStoreThemeConfig = {
  background: "#FAF6EF",
  surface: "#FFFFFF",
  sand: "#E8D8C3",
  primary: "#2F80A8",
  secondary: "#C86B4A",
  text: "#1F2A33",
  muted: "#8A9A5B",
  border: "#E4DDD3",
};

interface AdminStoreFormProps {
  existing?: AdminStore;
}

function joinList(arr?: string[]): string {
  return (arr ?? []).join(", ");
}

function splitList(val: string): string[] {
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const AdminStoreForm = ({ existing }: AdminStoreFormProps) => {
  const { token } = useAdminToken();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEdit = !!existing;

  // Core fields
  const [storeKey, setStoreKey] = useState(existing?.storeKey ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [countryFocus, setCountryFocus] = useState(existing?.countryFocus ?? "");
  const [defaultCurrency, setDefaultCurrency] = useState(existing?.defaultCurrency ?? "EUR");
  const [defaultLanguage, setDefaultLanguage] = useState(existing?.defaultLanguage ?? "en");
  const [active, setActive] = useState(existing?.active ?? true);

  // Homepage fields
  const hp = existing?.homepageConfig ?? {};
  const [heroTitle, setHeroTitle] = useState(hp.heroTitle ?? "");
  const [heroSubtitle, setHeroSubtitle] = useState(hp.heroSubtitle ?? "");
  const [primaryCta, setPrimaryCta] = useState(hp.primaryCta ?? "");
  const [secondaryCta, setSecondaryCta] = useState(hp.secondaryCta ?? "");
  const [newsletterTitle, setNewsletterTitle] = useState(hp.newsletterTitle ?? "");
  const [newsletterSubtitle, setNewsletterSubtitle] = useState(hp.newsletterSubtitle ?? "");

  // Taxonomy
  const [regions, setRegions] = useState(joinList(hp.regions));
  const [cities, setCities] = useState(joinList(hp.cities));
  const [categories, setCategories] = useState(joinList(hp.categories));
  const [tags, setTags] = useState(joinList(hp.tags));

  // Theme
  const th = existing?.themeConfig ?? DEFAULT_THEME;
  const [theme, setTheme] = useState<AdminStoreThemeConfig>({ ...DEFAULT_THEME, ...th });

  // SEO
  const seo = existing?.seoConfig ?? {};
  const [seoTitle, setSeoTitle] = useState(seo.defaultTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(seo.defaultDescription ?? "");

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function validate(): string[] {
    const errs: string[] = [];
    if (!isEdit && !storeKey) errs.push("Store key is required");
    if (!isEdit && storeKey && !STORE_KEY_RE.test(storeKey))
      errs.push("Store key must be lowercase letters/numbers, starting with a letter (e.g. postsofitaly)");
    if (!name) errs.push("Store name is required");
    if (!countryFocus) errs.push("Country focus is required");
    if (!defaultCurrency) errs.push("Currency is required");
    if (!defaultLanguage) errs.push("Language is required");
    for (const [key, val] of Object.entries(theme)) {
      if (!HEX_COLOR_RE.test(val)) errs.push(`Theme color "${key}" must be a valid 6-digit hex (e.g. #2F80A8)`);
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    if (!token) return;
    setSaving(true);

    const homepageConfig: AdminStoreHomepageConfig = {
      heroTitle: heroTitle || undefined,
      heroSubtitle: heroSubtitle || undefined,
      primaryCta: primaryCta || undefined,
      secondaryCta: secondaryCta || undefined,
      newsletterTitle: newsletterTitle || undefined,
      newsletterSubtitle: newsletterSubtitle || undefined,
      regions: splitList(regions),
      cities: splitList(cities),
      categories: splitList(categories),
      tags: splitList(tags),
    };

    const seoConfig: AdminStoreSeoConfig = {
      defaultTitle: seoTitle || undefined,
      defaultDescription: seoDescription || undefined,
    };

    try {
      if (isEdit && existing) {
        const payload: UpdateStorePayload = {
          name,
          countryFocus,
          defaultCurrency,
          defaultLanguage,
          active,
          themeConfig: theme,
          homepageConfig,
          seoConfig,
        };
        await adminUpdateStore(token, existing.storeKey, payload);
        toast({ title: "Store updated", description: `${name} has been saved.` });
        navigate("/admin/stores");
      } else {
        const payload: CreateStorePayload = {
          storeKey,
          name,
          countryFocus,
          defaultCurrency,
          defaultLanguage,
          active,
          themeConfig: theme,
          homepageConfig,
          seoConfig,
        };
        await adminCreateStore(token, payload);
        toast({ title: "Store created", description: `${name} (${storeKey}) is ready.` });
        navigate("/admin/stores");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save store";
      setErrors([msg]);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function updateThemeColor(key: keyof AdminStoreThemeConfig, val: string) {
    setTheme((prev) => ({ ...prev, [key]: val }));
  }

  const THEME_FIELDS: { key: keyof AdminStoreThemeConfig; label: string }[] = [
    { key: "background", label: "Background" },
    { key: "surface", label: "Surface" },
    { key: "sand", label: "Sand" },
    { key: "primary", label: "Primary" },
    { key: "secondary", label: "Secondary" },
    { key: "text", label: "Text" },
    { key: "muted", label: "Muted" },
    { key: "border", label: "Border" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {errors.length > 0 && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive space-y-1">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      {/* Core */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Core settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="store-key">Store key {!isEdit && <span className="text-destructive">*</span>}</Label>
            <Input
              id="store-key"
              value={storeKey}
              onChange={(e) => setStoreKey(e.target.value.toLowerCase())}
              placeholder="postsofitaly"
              disabled={isEdit}
              data-testid="store-key-input"
            />
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                Lowercase letters and numbers, starting with a letter. Cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="store-name">Store name <span className="text-destructive">*</span></Label>
            <Input
              id="store-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PostsofItaly"
              data-testid="store-name-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="country-focus">Country focus <span className="text-destructive">*</span></Label>
            <Input
              id="country-focus"
              value={countryFocus}
              onChange={(e) => setCountryFocus(e.target.value)}
              placeholder="Italy"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Default currency <span className="text-destructive">*</span></Label>
            <Input
              id="currency"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              placeholder="EUR"
              maxLength={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="language">Default language <span className="text-destructive">*</span></Label>
            <Input
              id="language"
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value.toLowerCase())}
              placeholder="en"
              maxLength={10}
            />
          </div>

          <div className="flex items-center gap-3 pt-6">
            <Switch
              id="active"
              checked={active}
              onCheckedChange={setActive}
              data-testid="store-active-toggle"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Active
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Homepage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Homepage content</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hero-title">Hero title</Label>
            <Input
              id="hero-title"
              value={heroTitle}
              onChange={(e) => setHeroTitle(e.target.value)}
              placeholder="Posters inspired by Italy"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hero-subtitle">Hero subtitle</Label>
            <Input
              id="hero-subtitle"
              value={heroSubtitle}
              onChange={(e) => setHeroSubtitle(e.target.value)}
              placeholder="Mediterranean places, colors and moments — printed for your home."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="primary-cta">Primary CTA</Label>
            <Input
              id="primary-cta"
              value={primaryCta}
              onChange={(e) => setPrimaryCta(e.target.value)}
              placeholder="Browse posters"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="secondary-cta">Secondary CTA</Label>
            <Input
              id="secondary-cta"
              value={secondaryCta}
              onChange={(e) => setSecondaryCta(e.target.value)}
              placeholder="Explore regions"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="newsletter-title">Newsletter title</Label>
            <Input
              id="newsletter-title"
              value={newsletterTitle}
              onChange={(e) => setNewsletterTitle(e.target.value)}
              placeholder="Get new Italian poster releases in your inbox"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="newsletter-subtitle">Newsletter subtitle</Label>
            <Input
              id="newsletter-subtitle"
              value={newsletterSubtitle}
              onChange={(e) => setNewsletterSubtitle(e.target.value)}
              placeholder="Be the first to see new collections..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Taxonomy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taxonomy starter lists</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="regions">Regions</Label>
            <Textarea
              id="regions"
              value={regions}
              onChange={(e) => setRegions(e.target.value)}
              placeholder="Tuscany, Lombardy, Sicily, Veneto, Lazio"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Comma-separated values</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cities">Cities</Label>
            <Textarea
              id="cities"
              value={cities}
              onChange={(e) => setCities(e.target.value)}
              placeholder="Rome, Milan, Florence, Venice, Naples"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Comma-separated values</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="categories">Categories</Label>
            <Textarea
              id="categories"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="Italian Cities, Coastal Posters, Food & Drinks, Architecture"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Comma-separated values</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tags">Tags</Label>
            <Textarea
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Mediterranean, Coastal, Vintage, Minimal, Architecture"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Comma-separated values</p>
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theme colors</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {THEME_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`theme-${key}`}>{label}</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={theme[key]}
                  onChange={(e) => updateThemeColor(key, e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer"
                  aria-label={`${label} color picker`}
                />
                <Input
                  id={`theme-${key}`}
                  value={theme[key]}
                  onChange={(e) => updateThemeColor(key, e.target.value)}
                  placeholder="#000000"
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
              {theme[key] && !HEX_COLOR_RE.test(theme[key]) && (
                <p className="text-xs text-destructive">Invalid hex color</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="seo-title">Default SEO title</Label>
            <Input
              id="seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="PostsofItaly — Art Posters of Italy"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="seo-description">Default SEO description</Label>
            <Textarea
              id="seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="Discover beautifully printed posters inspired by Italian cities, regions and moments."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/admin/stores")}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className="gap-2" data-testid="save-store-btn">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "Save changes" : "Create store"}
        </Button>
      </div>
    </form>
  );
};
