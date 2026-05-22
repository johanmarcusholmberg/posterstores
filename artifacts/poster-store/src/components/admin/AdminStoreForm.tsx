import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminCreateStore,
  adminUpdateStore,
  adminUploadStoreLogo,
  adminDeleteStoreLogo,
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
import { Save, ArrowLeft, Loader2, Upload, X, ImageIcon } from "lucide-react";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const STORE_KEY_RE = /^[a-z][a-z0-9]*$/;
const ROUTE_PREFIX_RE = /^[a-z][a-z0-9-]*$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

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
  useAdminToken();
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

  // Domain routing fields
  const [primaryDomain, setPrimaryDomain] = useState(existing?.primaryDomain ?? "");
  const [domainAliasesRaw, setDomainAliasesRaw] = useState(joinList(existing?.domainAliases ?? []));
  const [routePrefix, setRoutePrefix] = useState(existing?.routePrefix ?? "");

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

  // Logo / branding
  const [logoUrl, setLogoUrl] = useState(existing?.logoUrl ?? null);
  const [logoAltText, setLogoAltText] = useState(existing?.logoAltText ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoFileInputRef = useRef<HTMLInputElement>(null);

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

    // Domain routing validation
    if (routePrefix && !ROUTE_PREFIX_RE.test(routePrefix)) {
      errs.push("Route prefix must be lowercase letters, numbers, or hyphens, starting with a letter (e.g. spain)");
    }
    if (primaryDomain && !DOMAIN_RE.test(primaryDomain)) {
      errs.push("Primary domain must be a valid domain (e.g. postsofspain.com)");
    }
    const aliases = splitList(domainAliasesRaw);
    for (const alias of aliases) {
      if (!DOMAIN_RE.test(alias)) {
        errs.push(`Domain alias "${alias}" must be a valid domain (e.g. www.postsofspain.com)`);
      }
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

    const aliases = splitList(domainAliasesRaw);

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
          primaryDomain: primaryDomain || null,
          domainAliases: aliases.length > 0 ? aliases : null,
          routePrefix: routePrefix || null,
          logoAltText: logoAltText || null,
        };
        await adminUpdateStore(existing.storeKey, payload);
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
          primaryDomain: primaryDomain || null,
          domainAliases: aliases.length > 0 ? aliases : null,
          routePrefix: routePrefix || null,
        };
        await adminCreateStore(payload);
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

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError("");

    // Client-side pre-checks (server enforces the same rules)
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError("Please upload a PNG, JPEG, or WebP image.");
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setLogoError("Logo must be under 2 MB.");
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      return;
    }

    setLogoUploading(true);
    try {
      // Send file directly to backend — server validates MIME/size and uploads to storage
      const result = await adminUploadStoreLogo(existing!.storeKey, file, logoAltText || undefined);
      setLogoUrl(result.logoUrl);
      toast({ title: "Logo uploaded", description: "Store logo has been updated." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setLogoError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    if (!existing) return;
    setLogoUploading(true);
    setLogoError("");
    try {
      await adminDeleteStoreLogo(existing.storeKey);
      setLogoUrl(null);
      toast({ title: "Logo removed", description: "Store logo has been removed." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove logo";
      setLogoError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
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

      {/* Branding — only shown in edit mode since storeKey is needed for logo upload */}
      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current logo preview */}
            <div>
              <Label className="mb-2 block">Store logo</Label>
              {logoUrl ? (
                <div className="mb-3 flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
                  <img
                    src={logoUrl}
                    alt={logoAltText || name}
                    className="max-h-12 max-w-[180px] object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs text-muted-foreground">Current logo</span>
                </div>
              ) : (
                <div className="mb-3 flex items-center gap-3 p-3 rounded-lg border border-dashed border-border text-muted-foreground">
                  <ImageIcon className="w-5 h-5 shrink-0" />
                  <span className="text-sm">No logo uploaded yet</span>
                </div>
              )}

              {/* Upload / Remove actions */}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoFileChange}
                  disabled={logoUploading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => logoFileInputRef.current?.click()}
                  disabled={logoUploading}
                  data-testid="logo-upload-btn"
                >
                  {logoUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </Button>

                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    onClick={handleLogoRemove}
                    disabled={logoUploading}
                    data-testid="logo-remove-btn"
                  >
                    <X className="w-4 h-4" />
                    Remove logo
                  </Button>
                )}
              </div>

              {logoError && (
                <p className="mt-2 text-xs text-destructive">{logoError}</p>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">
                PNG, JPEG, or WebP · max 2 MB · transparent backgrounds work best
              </p>
            </div>

            {/* Logo alt text */}
            <div className="space-y-1.5">
              <Label htmlFor="logo-alt-text">Logo alt text</Label>
              <Input
                id="logo-alt-text"
                value={logoAltText}
                onChange={(e) => setLogoAltText(e.target.value)}
                placeholder={name || "Store logo"}
              />
              <p className="text-xs text-muted-foreground">
                Descriptive text for screen readers and when the image cannot load.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain & routing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domain &amp; routing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="route-prefix">Route prefix</Label>
            <Input
              id="route-prefix"
              value={routePrefix}
              onChange={(e) => setRoutePrefix(e.target.value.toLowerCase())}
              placeholder="spain"
              data-testid="route-prefix-input"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, hyphens (e.g. <code>spain</code>). Enables <code>/spain/shop</code>,{" "}
              <code>/spain/posters/:slug</code>, etc. Must be unique across stores.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="primary-domain">Primary domain</Label>
            <Input
              id="primary-domain"
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value.toLowerCase())}
              placeholder="postsofspain.com"
              data-testid="primary-domain-input"
            />
            <p className="text-xs text-muted-foreground">
              The main production domain. Must be unique across stores.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="domain-aliases">Domain aliases</Label>
            <Input
              id="domain-aliases"
              value={domainAliasesRaw}
              onChange={(e) => setDomainAliasesRaw(e.target.value.toLowerCase())}
              placeholder="www.postsofspain.com, postsofspain.es"
              data-testid="domain-aliases-input"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of additional domains that also point to this store (e.g. www subdomain).
            </p>
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
