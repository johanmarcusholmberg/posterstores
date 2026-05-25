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
  type AdminStoreTypographyConfig,
  type AdminStoreHomepageConfig,
  type AdminStoreSeoConfig,
  type HeroTextMode,
  type HeroOverlayMode,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const FONT_OPTIONS = [
  "System default",
  "Playfair Display",
  "Cormorant Garamond",
  "Lora",
  "Libre Baskerville",
  "Merriweather",
  "Inter",
  "DM Sans",
  "Source Sans 3",
  "Manrope",
] as const;

const TYPOGRAPHY_COLOR_FIELDS: { key: keyof AdminStoreTypographyConfig; label: string }[] = [
  { key: "headingColor", label: "Heading color" },
  { key: "linkColor", label: "Link color" },
  { key: "buttonTextColor", label: "Button text color" },
  { key: "heroEyebrowColor", label: "Hero eyebrow" },
  { key: "heroHeadingColor", label: "Hero heading" },
  { key: "heroSubtitleColor", label: "Hero subtitle" },
  { key: "heroBulletColor", label: "Hero bullets" },
];

const DEFAULT_TYPOGRAPHY: AdminStoreTypographyConfig = {};

const HERO_TEXT_MODES: { value: HeroTextMode; label: string }[] = [
  { value: "dark", label: "Dark (dark text on light background)" },
  { value: "light", label: "Light (white text on dark background)" },
  { value: "custom", label: "Custom (set individual colors)" },
];

const HERO_OVERLAY_MODES: { value: HeroOverlayMode; label: string }[] = [
  { value: "none", label: "None (no overlay)" },
  { value: "light", label: "Light (white tint)" },
  { value: "dark", label: "Dark (black tint)" },
  { value: "custom", label: "Custom opacity" },
];

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

  // Typography & hero settings
  const typo = existing?.typographyConfig ?? DEFAULT_TYPOGRAPHY;
  const [typography, setTypography] = useState<AdminStoreTypographyConfig>({ ...DEFAULT_TYPOGRAPHY, ...typo });

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
    const typoColorKeys: (keyof AdminStoreTypographyConfig)[] = [
      "headingColor", "linkColor", "buttonTextColor",
      "heroEyebrowColor", "heroHeadingColor", "heroSubtitleColor", "heroBulletColor",
    ];
    for (const key of typoColorKeys) {
      const val = typography[key] as string | undefined;
      if (val && !HEX_COLOR_RE.test(val)) {
        errs.push(`Typography color "${key}" must be a valid 6-digit hex (e.g. #2F80A8)`);
      }
    }
    if (typography.heroOverlayOpacity !== undefined) {
      const op = typography.heroOverlayOpacity;
      if (typeof op !== "number" || op < 0 || op > 1) {
        errs.push("Hero overlay opacity must be a number between 0 and 1");
      }
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
      const cleanedTypography: AdminStoreTypographyConfig = Object.fromEntries(
        Object.entries(typography).filter(([, v]) => v !== undefined && v !== "")
      ) as AdminStoreTypographyConfig;
      const typographyConfig = Object.keys(cleanedTypography).length > 0 ? cleanedTypography : null;

      if (isEdit && existing) {
        const payload: UpdateStorePayload = {
          name,
          countryFocus,
          defaultCurrency,
          defaultLanguage,
          active,
          themeConfig: theme,
          typographyConfig,
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
          typographyConfig,
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

  function updateTypography<K extends keyof AdminStoreTypographyConfig>(key: K, val: AdminStoreTypographyConfig[K] | undefined) {
    setTypography((prev) => {
      const next = { ...prev };
      if (val === undefined || val === "") {
        delete next[key];
      } else {
        next[key] = val;
      }
      return next;
    });
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

      {/* Brand & Typography */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand &amp; Typography</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Font presets */}
          <div>
            <p className="text-sm font-medium mb-3">Fonts</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["logoFont", "headingFont", "bodyFont"] as const).map((key) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`typo-${key}`}>
                    {key === "logoFont" ? "Logo font" : key === "headingFont" ? "Heading font" : "Body font"}
                  </Label>
                  <Select
                    value={typography[key] ?? ""}
                    onValueChange={(val) => updateTypography(key, val as typeof FONT_OPTIONS[number] || undefined)}
                  >
                    <SelectTrigger id={`typo-${key}`}>
                      <SelectValue placeholder="System default" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Extra colors */}
          <div>
            <p className="text-sm font-medium mb-1">Extra color overrides</p>
            <p className="text-xs text-muted-foreground mb-3">Leave blank to use the theme defaults above.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {TYPOGRAPHY_COLOR_FIELDS.map(({ key, label }) => {
                const colorKeys = ["headingColor", "linkColor", "buttonTextColor"] as const;
                const isHeroColor = !colorKeys.includes(key as typeof colorKeys[number]);
                return (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`typo-color-${key}`}>{label}</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={typography[key] as string || "#000000"}
                        onChange={(e) => updateTypography(key, e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                        aria-label={`${label} color picker`}
                        title={isHeroColor ? "Only applied when Hero text mode is Custom" : undefined}
                      />
                      <Input
                        id={`typo-color-${key}`}
                        value={typography[key] as string || ""}
                        onChange={(e) => updateTypography(key, e.target.value || undefined)}
                        placeholder="leave blank"
                        className="font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                    {(typography[key] as string | undefined) && !HEX_COLOR_RE.test(typography[key] as string) && (
                      <p className="text-xs text-destructive">Invalid hex color</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hero text mode */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Hero text mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controls how hero text looks when a background image is set. Leaving unset preserves existing behavior (white text on background image).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hero-text-mode">Text mode</Label>
              <Select
                value={typography.heroTextMode ?? "__unset__"}
                onValueChange={(val) => updateTypography("heroTextMode", (val === "__unset__" ? undefined : val) as HeroTextMode | undefined)}
              >
                <SelectTrigger id="hero-text-mode">
                  <SelectValue placeholder="Unset (default behavior)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">Unset (default behavior)</SelectItem>
                  {HERO_TEXT_MODES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hero overlay mode */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Hero overlay</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controls the overlay tint on top of the hero background image.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="hero-overlay-mode">Overlay mode</Label>
                <Select
                  value={typography.heroOverlayMode ?? "__unset__"}
                  onValueChange={(val) => updateTypography("heroOverlayMode", (val === "__unset__" ? undefined : val) as HeroOverlayMode | undefined)}
                >
                  <SelectTrigger id="hero-overlay-mode">
                    <SelectValue placeholder="Unset (dark overlay by default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">Unset (dark overlay by default)</SelectItem>
                    {HERO_OVERLAY_MODES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(typography.heroOverlayMode === "light" || typography.heroOverlayMode === "dark" || typography.heroOverlayMode === "custom") && (
                <div className="space-y-1.5">
                  <Label htmlFor="hero-overlay-opacity">
                    Opacity <span className="text-muted-foreground font-normal">(0–1)</span>
                  </Label>
                  <Input
                    id="hero-overlay-opacity"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={typography.heroOverlayOpacity ?? ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateTypography("heroOverlayOpacity", isNaN(v) ? undefined : Math.min(1, Math.max(0, v)));
                    }}
                    placeholder="0.3"
                    className="font-mono text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div>
            <p className="text-sm font-medium mb-2">Live preview</p>
            <div
              className="rounded-lg border border-border p-5 space-y-3"
              style={{
                backgroundColor: theme.background,
                fontFamily: typography.bodyFont && typography.bodyFont !== "System default"
                  ? `'${typography.bodyFont}', sans-serif`
                  : undefined,
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: theme.muted }}
              >
                Eyebrow / Collection label
              </div>
              <div
                className="text-2xl font-bold"
                style={{
                  fontFamily: typography.headingFont && typography.headingFont !== "System default"
                    ? `'${typography.headingFont}', serif`
                    : "'Playfair Display', serif",
                  color: typography.headingColor || theme.text,
                }}
              >
                {name || "Store heading"}
              </div>
              <div
                className="text-sm"
                style={{ color: theme.text + "bb" }}
              >
                Body text — your poster collection description goes here.
              </div>
              <div className="flex gap-2 flex-wrap mt-1">
                <span
                  className="inline-block text-xs px-3 py-1.5 rounded font-semibold"
                  style={{
                    backgroundColor: theme.primary,
                    color: typography.buttonTextColor || "#ffffff",
                  }}
                >
                  Primary button
                </span>
                <span
                  className="inline-block text-xs px-3 py-1.5 rounded font-semibold border"
                  style={{
                    borderColor: theme.primary + "55",
                    color: typography.linkColor || theme.primary,
                    backgroundColor: "transparent",
                  }}
                >
                  Secondary button
                </span>
              </div>
              <div className="text-xs pt-1">
                Product title —{" "}
                <span className="font-semibold" style={{ color: theme.text }}>Poster Name</span>
                {"  "}
                <span style={{ color: typography.linkColor || theme.primary }}>€29.99</span>
              </div>
            </div>
          </div>
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
