import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import {
  useGetFeaturedPosters,
  getGetFeaturedPostersQueryKey,
  useListPosters,
  getListPostersQueryKey,
  ListPostersSort,
  Poster,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  type CollectionBannerVisualConfig,
  type HomepageSectionConfig,
  type HeroButtonStyleConfig,
  type HeroTrustBadge,
} from "@/config/storefronts";
import { makeShopUrl, resolveHomepageLink, focalToObjectPosition, cleanColor, fontFamilyFromOverride } from "@/lib/bannerUtils";
import { CollectionBannerSection } from "@/components/shared/CollectionBannerSection";

const DEFAULT_TRUST_BADGES: HeroTrustBadge[] = [
  { id: "fine-art", text: "Fine art prints" },
  { id: "ships-worldwide", text: "Ships worldwide" },
  { id: "sustainably-made", text: "Sustainably made" },
];

/** Compute className for a hero button wrapper based on its mobile/desktop visibility.
 * @param defaultMobile - whether to show on mobile when showMobile is undefined (default true; use false for extra buttons). */
function heroBtnWrapperCls(showMobile: boolean | undefined, showDesktop: boolean | undefined, defaultMobile = true): string {
  const m = showMobile !== undefined ? showMobile : defaultMobile;
  const d = showDesktop !== false;
  if (m && d) return "w-full sm:w-auto";
  if (!m && !d) return "hidden";
  if (!m) return "hidden sm:block sm:w-auto"; // desktop only
  return "sm:hidden w-full"; // mobile only
}

const VALUE_PROPS = [
  { title: "Museum quality", description: "Archival inks on premium fine art paper" },
  { title: "Made to order", description: "Printed especially for you when you order" },
  { title: "Worldwide shipping", description: "Carefully packed and shipped to your door" },
  { title: "Better choice", description: "Sustainably made with responsible materials" },
];

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
  const symbol = symbols[currency] ?? currency;
  if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
  return `${symbol}${price.toFixed(2)}`;
}


/** Use <a> for external URLs, <Link> for internal routes. */
function SmartLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return <Link href={href} className={className}>{children}</Link>;
}


function buttonStyleFromOverride(style?: HeroButtonStyleConfig | null): React.CSSProperties | undefined {
  if (!style) return undefined;
  const result: React.CSSProperties = {};
  if (style.textColor) result.color = style.textColor;
  if (style.backgroundColor) result.backgroundColor = style.backgroundColor;
  if (style.borderColor) result.borderColor = style.borderColor;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Shared badge class constants for card overlays */
const NEW_BADGE_CLS =
  "absolute top-2 right-2 z-10 pointer-events-none rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-[#fefcfa]/80 backdrop-blur-[2px] text-[10px] font-medium tracking-[0.12em] uppercase px-2.5 py-[3px]";

// ─── Card components ─────────────────────────────────────────────────────────

/**
 * Returns orientation-aware inline style for the inner artwork wrapper.
 * Ratio is read from img.naturalWidth/naturalHeight on load — NOT from print-size labels.
 * Before load (null): absolute fill so object-contain img is immediately visible.
 * Portrait (< 1): fill card height, auto width — tiny side gaps acceptable.
 * Landscape/square (≥ 1): fill card width, auto height — background above/below blends.
 *
 * Uses absolute positioning + translate(-50%,-50%) for rock-solid centering inside
 * any stage, avoiding flex/aspect-ratio cross-browser quirks.
 */
function artworkInnerStyle(ratio: number | null): React.CSSProperties {
  if (ratio === null) return { position: "absolute", inset: 0 };
  if (ratio < 1)
    return {
      position: "absolute",
      aspectRatio: String(ratio),
      height: "100%",
      width: "auto",
      maxWidth: "100%",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  return {
    position: "absolute",
    aspectRatio: String(ratio),
    width: "100%",
    height: "auto",
    maxHeight: "100%",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };
}

function HomePosterCard({ poster }: { poster: Poster }) {
  const slug = (poster as any).slug as string | undefined;
  const href = slug ? `/posters/${slug}` : `/poster/${poster.id}`;
  const activeSizes = poster.posterSizes?.filter((s) => s.active) ?? [];
  const lowestPrice = poster.lowestActivePrice;
  const displayPrice = lowestPrice != null ? lowestPrice : poster.price;
  const displayCurrency = activeSizes[0]?.currency ?? poster.currency;
  const priceLabel =
    activeSizes.length > 1
      ? `From ${formatPrice(displayPrice, displayCurrency)}`
      : formatPrice(displayPrice, displayCurrency);
  const baseImage = poster.imageUrl;
  const primaryMockup = poster.primaryDisplayImageUrl ?? null;
  const dedicatedHover = poster.hoverDisplayImageUrl ?? null;
  const hoverImage: string | null =
    dedicatedHover ??
    (primaryMockup && primaryMockup !== baseImage ? primaryMockup : null);

  const [ratio, setRatio] = useState<number | null>(null);

  return (
    <Link
      href={href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[#f4f0eb] shadow-[0_1px_4px_rgba(0,0,0,0.06)] group-hover:shadow-[0_3px_14px_rgba(0,0,0,0.11)] transition-shadow duration-300">
        {/* Artwork: outer flex centers the inner ratio-wrapper; border hugs artwork; object-contain never crops */}
        <div
          className={[
            "absolute inset-0 flex items-center justify-center",
            "motion-reduce:transition-none",
            hoverImage
              ? "transition-opacity duration-[280ms] ease-out opacity-100 group-hover:opacity-0 group-focus-within:opacity-0"
              : "",
          ].join(" ")}
        >
          <div
            className={[
              ratio !== null ? "ring-1 ring-inset ring-black/[0.14]" : "",
              !hoverImage
                ? "transition-transform duration-[300ms] ease-out scale-100 group-hover:scale-[1.07] group-focus-within:scale-[1.07] motion-reduce:transition-none"
                : "",
            ].join(" ")}
            style={artworkInnerStyle(ratio)}
          >
            <img
              src={getOptimizedImageUrl(baseImage, { width: 600, quality: 85 })}
              alt={poster.title}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0)
                  setRatio(img.naturalWidth / img.naturalHeight);
              }}
              onError={(e) => { (e.target as HTMLImageElement).src = poster.imageUrl; }}
            />
          </div>
        </div>
        {hoverImage && (
          <img
            src={getOptimizedImageUrl(hoverImage, { width: 600, quality: 80 })}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 object-cover w-full h-full transition-opacity duration-[280ms] ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>
      <div className="mt-1.5 min-w-0">
        <h3 className="font-serif font-semibold text-sm text-foreground truncate leading-snug">
          {(poster as any).displayTitle || poster.title}
        </h3>
        <div className="flex items-center justify-between mt-0.5 gap-1">
          <p className="text-xs font-medium text-foreground/70">{priceLabel}</p>
          {poster.isNew && (
            <div className="shrink-0 rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-[#fefcfa] text-[10px] font-medium tracking-[0.12em] uppercase px-2 py-[2px]">
              NEW
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function NewArrivalCard({
  poster,
  titleColor,
  priceColor,
}: {
  poster: Poster;
  titleColor?: string;
  priceColor?: string;
}) {
  const slug = (poster as any).slug as string | undefined;
  const href = slug ? `/posters/${slug}` : `/poster/${poster.id}`;
  const activeSizes = poster.posterSizes?.filter((s) => s.active) ?? [];
  const lowestPrice = poster.lowestActivePrice;
  const displayPrice = lowestPrice != null ? lowestPrice : poster.price;
  const displayCurrency = activeSizes[0]?.currency ?? poster.currency;
  const hasPrice = displayPrice != null;
  const priceLabel =
    activeSizes.length > 1
      ? `From ${formatPrice(displayPrice, displayCurrency)}`
      : formatPrice(displayPrice, displayCurrency);
  const sizeLabels = activeSizes
    .slice(0, 4)
    .map((s) => (s as any).size as string | undefined)
    .filter(Boolean) as string[];
  const baseImage = poster.imageUrl;
  const stageRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);

  const wrapperStyle: React.CSSProperties | undefined = (() => {
    if (!stageSize || ratio === null) return { position: "absolute", inset: 0 };
    const { w: cw, h: ch } = stageSize;
    const cr = cw / ch;
    if (ratio >= cr) {
      // Wider than stage: fit to stage width, auto height
      const width = cw;
      const height = width / ratio;
      return { position: "absolute", width, height, top: (ch - height) / 2, left: 0 };
    }
    // Taller than stage: fit to stage height, auto width
    const height = ch;
    const width = height * ratio;
    return { position: "absolute", width, height, top: 0, left: (cw - width) / 2 };
  })();

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setRatio(img.naturalWidth / img.naturalHeight);
    }
    if (stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      setStageSize({ w: rect.width, h: rect.height });
    }
  }

  return (
    <Link
      href={href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div
        ref={stageRef}
        className="relative aspect-[3/4] overflow-hidden"
      >
        <div
          className="absolute inset-0 shadow-[0_1px_4px_rgba(0,0,0,0.06)] group-hover:shadow-[0_4px_18px_rgba(0,0,0,0.13)] transition-shadow duration-300"
          style={wrapperStyle}
        >
          <img
            src={getOptimizedImageUrl(baseImage, { width: 400, quality: 75 })}
            alt={poster.title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-contain"
            onLoad={handleImgLoad}
          />
          {/* Hover overlay hugs the actual image */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-250 flex flex-col justify-end p-3 pointer-events-none"
            aria-hidden="true"
          >
            {hasPrice && <p className="text-white text-[11px] font-semibold mb-0.5">{priceLabel}</p>}
            {sizeLabels.length > 0 && (
              <p className="text-white/65 text-[10px] mb-1.5 leading-tight">{sizeLabels.join(" · ")}</p>
            )}
            <span className="text-white/90 text-[11px] font-medium">View poster →</span>
          </div>
          {/* Border ring hugs the actual image */}
          <div className="absolute inset-0 ring-1 ring-inset ring-black/[0.14] pointer-events-none" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-1.5 min-w-0">
        <h3
          className="font-serif font-semibold text-sm text-foreground truncate leading-snug"
          style={titleColor ? { color: titleColor } : undefined}
        >
          {(poster as any).displayTitle || poster.title}
        </h3>
        {hasPrice && (
          <p
            className="text-xs font-medium text-foreground/70 mt-0.5 sm:hidden"
            style={priceColor ? { color: priceColor } : undefined}
          >
            {priceLabel}
          </p>
        )}
        {poster.isNew && (
          <div className="mt-0.5 inline-flex rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-[#fefcfa] text-[10px] font-medium tracking-[0.12em] uppercase px-2 py-[2px]">
            NEW
          </div>
        )}
      </div>
    </Link>
  );
}

function FeaturedPosterCard({
  poster,
  priority = false,
  titleColor,
  priceColor,
}: {
  poster: Poster;
  priority?: boolean;
  titleColor?: string;
  priceColor?: string;
}) {
  const slug = (poster as any).slug as string | undefined;
  const href = slug ? `/posters/${slug}` : `/poster/${poster.id}`;
  const activeSizes = poster.posterSizes?.filter((s) => s.active) ?? [];
  const lowestPrice = poster.lowestActivePrice;
  const displayPrice = lowestPrice != null ? lowestPrice : poster.price;
  const displayCurrency = activeSizes[0]?.currency ?? poster.currency;
  const priceLabel =
    activeSizes.length > 1
      ? `From ${formatPrice(displayPrice, displayCurrency)}`
      : formatPrice(displayPrice, displayCurrency);
  const displayImage = poster.primaryDisplayImageUrl ?? poster.imageUrl;
  const cardTitle = (poster as any).displayTitle || poster.title;

  const [ratio, setRatio] = useState<number | null>(null);

  return (
    <Link
      href={href}
      className="group flex flex-col h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className={[
        "flex flex-col flex-1",
        "bg-[#faf8f3] rounded-[2px]",
        "shadow-[0_2px_8px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.06)]",
        "group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.09)]",
        "group-hover:-translate-y-0.5",
        "transition-all duration-300 ease-out",
        "p-2 pb-0",
      ].join(" ")}>
        <div
          className="relative aspect-[5/7] overflow-hidden"
          style={{ backgroundColor: ratio !== null && ratio > 5 / 7 ? '#faf8f3' : '#ede8e0' }}
        >
          {/* Artwork: inner ratio-wrapper with object-contain — border hugs artwork, no cropping */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={[
                ratio !== null ? "ring-1 ring-inset ring-black/[0.14]" : "",
                "motion-reduce:transition-none",
              ].join(" ")}
              style={artworkInnerStyle(ratio)}
            >
              <img
                src={getOptimizedImageUrl(displayImage, { width: 600, quality: 85 })}
                alt={poster.title}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : undefined}
                decoding="async"
                className="absolute inset-0 w-full h-full object-contain"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0)
                    setRatio(img.naturalWidth / img.naturalHeight);
                }}
                onError={(e) => { (e.target as HTMLImageElement).src = poster.imageUrl; }}
              />
            </div>
          </div>
        </div>
        <div className="px-0.5 pt-2.5 pb-3 min-h-[52px] flex flex-col justify-start min-w-0">
          <h3
            className="font-serif font-semibold text-[13px] sm:text-xs text-foreground/85 truncate leading-snug"
            style={titleColor ? { color: titleColor } : undefined}
          >
            {cardTitle}
          </h3>
          <p
            className="text-[11px] text-foreground/50 mt-1"
            style={priceColor ? { color: priceColor } : undefined}
          >
            {priceLabel}
          </p>
          {poster.isNew && (
            <div className="mt-1.5 self-start rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-transparent text-[10px] font-medium tracking-[0.12em] uppercase px-2 py-[2px]">
              NEW
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function FeaturedPosterCardSkeleton() {
  return (
    <div className="bg-[#faf8f3] rounded-[2px] shadow-[0_2px_8px_rgba(0,0,0,0.07)] p-2 pb-0">
      <div className="aspect-[5/7] bg-muted animate-pulse" />
      <div className="px-0.5 py-2.5 pb-3">
        <div className="h-3 bg-muted animate-pulse w-3/4" />
        <div className="mt-1.5 h-2.5 bg-muted animate-pulse w-1/2" />
      </div>
    </div>
  );
}

function PosterCardSkeleton() {
  return (
    <div className="flex-none w-[155px] sm:w-[170px] lg:w-[185px] snap-start">
      <div className="aspect-[3/4] bg-muted animate-pulse" />
      <div className="mt-1.5 h-3.5 bg-muted animate-pulse w-3/4" />
      <div className="mt-1 h-3 bg-muted animate-pulse w-1/2" />
    </div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

interface HeroSectionProps {
  store: ReturnType<typeof useStorefront>;
  resolvedRoutePrefix: string | null;
  sectionConfig?: HomepageSectionConfig | null;
}

function HeroSection({ store, resolvedRoutePrefix, sectionConfig }: HeroSectionProps) {
  const heroVisual = store.homepageVisualConfig?.hero;
  const hasHeroBg = !!heroVisual?.backgroundImageUrl;
  const heroTextMode = store.typographyConfig?.heroTextMode;
  const heroOverlayMode = store.typographyConfig?.heroOverlayMode;
  const useStoreHeroVars = !!heroTextMode;
  const useStoreOverlay = !!heroOverlayMode;

  const primaryHref = resolveHomepageLink(resolvedRoutePrefix, heroVisual?.primaryButtonLink);
  const secondaryHref = resolveHomepageLink(resolvedRoutePrefix, heroVisual?.secondaryButtonLink);

  // Section-level overrides
  const co = sectionConfig?.colorOverrides;
  const fo = sectionConfig?.fontOverrides;
  const headingColorOverride = cleanColor(co?.headingColor);
  const textColorOverride = cleanColor(co?.textColor);
  const bgColorOverride = cleanColor(co?.backgroundColor);
  const overlayColorOverride = cleanColor(co?.overlayColor);
  const overlayOpacityOverride = co?.overlayOpacity ?? null;
  const headingFontOverride = fontFamilyFromOverride(fo?.headingFont);
  const bodyFontOverride = fontFamilyFromOverride(fo?.bodyFont);

  // Compute heading style
  const headingStyle: React.CSSProperties = {};
  if (headingColorOverride) {
    headingStyle.color = headingColorOverride;
  } else if (useStoreHeroVars) {
    headingStyle.color = "var(--store-hero-heading-color)";
  }
  if (headingFontOverride) headingStyle.fontFamily = headingFontOverride;

  // Compute subtitle/bullet style
  const subtitleStyle: React.CSSProperties = {};
  if (textColorOverride) {
    subtitleStyle.color = textColorOverride;
  } else if (useStoreHeroVars) {
    subtitleStyle.color = "var(--store-hero-subtitle-color)";
  }
  if (bodyFontOverride) subtitleStyle.fontFamily = bodyFontOverride;

  const bulletStyle: React.CSSProperties = {};
  if (textColorOverride) {
    bulletStyle.color = textColorOverride;
  } else if (useStoreHeroVars) {
    bulletStyle.color = "var(--store-hero-bullet-color)";
  }

  // Overlay style (for when bg image is present)
  const overlayDivStyle: React.CSSProperties = (() => {
    if (!hasHeroBg) return {};
    if (overlayColorOverride || overlayOpacityOverride != null) {
      const style: React.CSSProperties = {
        backgroundColor: overlayColorOverride ?? `rgba(0,0,0,${overlayOpacityOverride ?? 0.3})`,
      };
      if (overlayColorOverride && overlayOpacityOverride != null) style.opacity = overlayOpacityOverride;
      return style;
    }
    if (useStoreOverlay) return { backgroundColor: "var(--store-hero-overlay-color)" };
    return { backgroundColor: `rgba(0,0,0,${heroVisual?.backgroundOverlayOpacity ?? 0.3})` };
  })();

  // Section background style
  const sectionStyle: React.CSSProperties = hasHeroBg
    ? {
        backgroundImage: `url(${heroVisual!.backgroundImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : bgColorOverride
    ? { backgroundColor: bgColorOverride }
    : {};

  // Trust badges — use store config, fall back to hardcoded defaults
  const trustBadges = (heroVisual?.trustBadges && heroVisual.trustBadges.length > 0)
    ? heroVisual.trustBadges
    : DEFAULT_TRUST_BADGES;

  return (
    <section
      className={cn("relative overflow-hidden", !hasHeroBg && !bgColorOverride && "bg-sand")}
      style={sectionStyle}
    >
      {hasHeroBg && (
        <div className="absolute inset-0 pointer-events-none" style={overlayDivStyle} />
      )}
      <div className="relative z-10 container mx-auto max-w-screen-2xl px-6 lg:px-10 pt-3 pb-5 lg:pt-4 lg:pb-6 text-center">
        <h1
          className={cn(
            "font-serif text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 leading-tight",
            !headingColorOverride && !useStoreHeroVars && (hasHeroBg ? "text-white" : "text-primary")
          )}
          style={Object.keys(headingStyle).length > 0 ? headingStyle : undefined}
        >
          {store.homepage?.heroTitle || "Posters inspired by Spain"}
        </h1>
        <p
          className={cn(
            "text-sm mb-5 max-w-xl mx-auto leading-relaxed",
            !textColorOverride && !useStoreHeroVars && (hasHeroBg ? "text-white/80" : "text-foreground/65")
          )}
          style={Object.keys(subtitleStyle).length > 0 ? subtitleStyle : undefined}
        >
          {store.homepage?.heroSubtitle || "Mediterranean places, colors and moments — printed for your home."}
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center flex-wrap">
          <SmartLink href={primaryHref} className={heroBtnWrapperCls(heroVisual?.primaryButtonShowMobile, heroVisual?.primaryButtonShowDesktop)}>
            <Button
              size="default"
              data-testid="btn-hero-primary"
              variant={
                hasHeroBg && !useStoreHeroVars
                  ? "default"
                  : heroVisual?.primaryButtonVariant === "outline"
                  ? "outline"
                  : "default"
              }
              className={cn(
                "w-full sm:w-auto h-11 px-6 text-sm",
                !heroVisual?.primaryButtonStyle && hasHeroBg && !useStoreHeroVars && "bg-white text-primary hover:bg-white/90 border-0"
              )}
              style={buttonStyleFromOverride(heroVisual?.primaryButtonStyle)}
            >
              {heroVisual?.primaryButtonText || store.homepage?.primaryCta || "Browse posters"}
            </Button>
          </SmartLink>
          <SmartLink href={secondaryHref} className={heroBtnWrapperCls(heroVisual?.secondaryButtonShowMobile, heroVisual?.secondaryButtonShowDesktop)}>
            <Button
              size="default"
              variant="outline"
              className={cn(
                "w-full sm:w-auto h-11 px-6 text-sm",
                !heroVisual?.secondaryButtonStyle && !useStoreHeroVars && (hasHeroBg
                  ? "border-white/60 text-white hover:bg-white/10 bg-transparent"
                  : "border-primary/30 text-primary hover:bg-primary/5")
              )}
              style={buttonStyleFromOverride(heroVisual?.secondaryButtonStyle)}
            >
              {heroVisual?.secondaryButtonText || store.homepage?.secondaryCta || "View all regions"}
            </Button>
          </SmartLink>
          {(heroVisual?.extraButtons ?? [])
            .filter(btn => btn.visible !== false && btn.label.trim())
            .map(btn => {
              const extraHref = resolveHomepageLink(resolvedRoutePrefix, btn.link || null);
              const isFilled = btn.variant === "filled";
              return (
                <SmartLink key={btn.id} href={extraHref} className={heroBtnWrapperCls(btn.showMobile, btn.showDesktop, false)}>
                  <Button
                    size="default"
                    variant={isFilled ? "default" : "outline"}
                    className={cn(
                      "w-full sm:w-auto h-11 px-6 text-sm",
                      !btn.style && isFilled && hasHeroBg && !useStoreHeroVars && "bg-white text-primary hover:bg-white/90 border-0",
                      !btn.style && !isFilled && !useStoreHeroVars && (hasHeroBg
                        ? "border-white/60 text-white hover:bg-white/10 bg-transparent"
                        : "border-primary/30 text-primary hover:bg-primary/5")
                    )}
                    style={buttonStyleFromOverride(btn.style)}
                  >
                    {btn.label}
                  </Button>
                </SmartLink>
              );
            })
          }
        </div>
        <div
          className={cn(
            "mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 justify-center text-xs",
            !textColorOverride && !useStoreHeroVars && (hasHeroBg ? "text-white/50" : "text-foreground/40")
          )}
          style={Object.keys(bulletStyle).length > 0 ? bulletStyle : undefined}
        >
          {trustBadges.filter(b => b.text.trim()).map(badge => (
            <span key={badge.id} className={badge.showMobile === false ? "hidden sm:inline" : undefined}>
              ✦ {badge.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

interface FeaturedPostersSectionProps {
  featured: Poster[] | undefined;
  resolvedRoutePrefix: string | null;
  sectionConfig?: HomepageSectionConfig | null;
}

function FeaturedPostersSection({ featured, resolvedRoutePrefix, sectionConfig }: FeaturedPostersSectionProps) {
  const FEATURED_LIMIT = 6;
  const co = sectionConfig?.colorOverrides;
  const fo = sectionConfig?.fontOverrides;
  const headingColor = cleanColor(co?.headingColor);
  const headingFont = fontFamilyFromOverride(fo?.headingFont);
  const linkColor = cleanColor(co?.linkColor);
  const posterTitleColor = cleanColor(co?.posterTitleColor);
  const posterPriceColor = cleanColor(co?.posterPriceColor);

  return (
    <section className="pt-4 pb-5 lg:pt-4 lg:pb-6">
      <div className="container mx-auto max-w-screen-2xl px-6 lg:px-10">
        <div className="flex items-center justify-between mb-5 lg:mb-6">
          <h2
            className="font-serif text-xl font-bold text-foreground"
            style={{
              ...(headingColor ? { color: headingColor } : {}),
              ...(headingFont ? { fontFamily: headingFont } : {}),
            }}
          >
            Featured posters
          </h2>
          <Link
            href={makeShopUrl(resolvedRoutePrefix)}
            className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
            style={linkColor ? { color: linkColor } : undefined}
          >
            View all &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 lg:gap-4 items-stretch">
          {featured && featured.length > 0
            ? featured.slice(0, FEATURED_LIMIT).map((poster, i) => (
                <div key={poster.id} className={["h-full", i >= 4 ? "hidden sm:block" : ""].filter(Boolean).join(" ")}>
                  <FeaturedPosterCard
                    poster={poster}
                    priority={i < 2}
                    titleColor={posterTitleColor}
                    priceColor={posterPriceColor}
                  />
                </div>
              ))
            : Array.from({ length: FEATURED_LIMIT }).map((_, i) => (
                <div key={i} className={["h-full", i >= 4 ? "hidden sm:block" : ""].filter(Boolean).join(" ")}>
                  <FeaturedPosterCardSkeleton />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}


interface ExploreLinksProps {
  regionChips: string[];
  categoryChips: string[];
  resolvedRoutePrefix: string | null;
  regionFilterLabel: string;
}

function ExploreLinksSection({ regionChips, categoryChips, resolvedRoutePrefix, regionFilterLabel }: ExploreLinksProps) {
  if (regionChips.length === 0 && categoryChips.length === 0) return null;
  return (
    <section className="py-3 lg:py-4" data-testid="shop-by-region-section">
      <div className="container mx-auto max-w-screen-2xl px-6 lg:px-10">
        <h2 className="font-serif text-lg font-bold text-foreground mb-4">{regionFilterLabel}</h2>
        <div className="flex flex-wrap gap-2">
          {regionChips.map((region) => (
            <Link
              key={region}
              href={makeShopUrl(resolvedRoutePrefix, `region=${encodeURIComponent(region)}`)}
              className="flex-1 min-w-fit inline-flex items-center justify-center px-3.5 py-1.5 rounded-full border border-border text-sm text-foreground/75 bg-surface hover:bg-sand/60 hover:border-primary/30 hover:text-primary transition-colors duration-150"
            >
              {region}
            </Link>
          ))}
          {categoryChips.map((cat) => (
            <Link
              key={cat}
              href={makeShopUrl(resolvedRoutePrefix, `category=${encodeURIComponent(cat)}`)}
              className="flex-1 min-w-fit inline-flex items-center justify-center px-3.5 py-1.5 rounded-full border border-border text-sm text-foreground/75 bg-surface hover:bg-sand/60 hover:border-primary/30 hover:text-primary transition-colors duration-150"
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

interface NewArrivalsSectionProps {
  newArrivals: Poster[];
  resolvedRoutePrefix: string | null;
  naCanScrollLeft: boolean;
  naCanScrollRight: boolean;
  trackRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  sectionConfig?: HomepageSectionConfig | null;
}

function NewArrivalsSection({
  newArrivals,
  resolvedRoutePrefix,
  naCanScrollLeft,
  naCanScrollRight,
  trackRef,
  onScroll,
  onScrollLeft,
  onScrollRight,
  sectionConfig,
}: NewArrivalsSectionProps) {
  if (newArrivals.length === 0) return null;

  const co = sectionConfig?.colorOverrides;
  const fo = sectionConfig?.fontOverrides;
  const headingColor = cleanColor(co?.headingColor);
  const headingFont = fontFamilyFromOverride(fo?.headingFont);
  const linkColor = cleanColor(co?.linkColor);
  const posterTitleColor = cleanColor(co?.posterTitleColor);
  const posterPriceColor = cleanColor(co?.posterPriceColor);

  return (
    <section className="pt-3 pb-4 lg:pt-4 lg:pb-5" data-testid="new-arrivals-section">
      <div className="container mx-auto max-w-screen-2xl px-6 lg:px-10 mb-4">
        <div className="flex items-center justify-between">
          <h2
            className="font-serif text-xl font-bold text-foreground"
            style={{
              ...(headingColor ? { color: headingColor } : {}),
              ...(headingFont ? { fontFamily: headingFont } : {}),
            }}
          >
            New arrivals
          </h2>
          <Link
            href={makeShopUrl(resolvedRoutePrefix, "sort=newest")}
            className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
            style={linkColor ? { color: linkColor } : undefined}
          >
            View all &rarr;
          </Link>
        </div>
      </div>
      <div className="container mx-auto max-w-screen-2xl pl-6 lg:pl-10 pr-0">
        <div className="relative">
          <div
            ref={trackRef}
            className="flex gap-4 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={onScroll}
          >
            {newArrivals.map((poster) => (
              <div key={poster.id} className="flex-none snap-start w-[74vw] sm:w-[240px] lg:w-[260px]">
                <NewArrivalCard
                  poster={poster}
                  titleColor={posterTitleColor}
                  priceColor={posterPriceColor}
                />
              </div>
            ))}
            <div className="flex-none w-4 lg:w-6" aria-hidden="true" />
          </div>
          <div
            className="absolute inset-y-0 right-0 w-14 lg:w-20 bg-gradient-to-l from-background to-transparent pointer-events-none"
            aria-hidden="true"
          />
          {naCanScrollLeft && (
            <button
              onClick={onScrollLeft}
              aria-label="Scroll New arrivals left"
              className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-8 h-8 rounded-full bg-background/95 border border-border shadow-md text-foreground/80 hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {naCanScrollRight && (
            <button
              onClick={onScrollRight}
              aria-label="Scroll New arrivals right"
              className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-8 h-8 rounded-full bg-background/95 border border-border shadow-md text-foreground/80 hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function BrandStorySection({
  brandStory,
  sectionConfig,
}: {
  brandStory: string;
  sectionConfig?: HomepageSectionConfig | null;
}) {
  const co = sectionConfig?.colorOverrides;
  const fo = sectionConfig?.fontOverrides;
  const textColor = cleanColor(co?.textColor);
  const bgColor = cleanColor(co?.backgroundColor);
  const fontFamily = fontFamilyFromOverride(fo?.bodyFont ?? fo?.headingFont);

  return (
    <section
      className="py-8 lg:py-10"
      data-testid="brand-story-section"
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      <div className="max-w-2xl mx-auto px-6 text-center">
        <p
          className="font-serif text-xl md:text-2xl text-foreground/75 leading-relaxed italic"
          style={{
            ...(textColor ? { color: textColor } : {}),
            ...(fontFamily ? { fontFamily } : {}),
          }}
        >
          &ldquo;{brandStory}&rdquo;
        </p>
      </div>
    </section>
  );
}

function ValuePropsSection() {
  return (
    <section className="border-t border-border py-8 lg:py-10">
      <div className="container mx-auto max-w-screen-2xl px-6 lg:px-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {VALUE_PROPS.map((prop, i) => (
            <div
              key={i}
              className="text-center px-4 py-5 bg-surface border border-border/50 rounded-xl"
              data-testid={`value-card-${i}`}
            >
              <h3 className="font-serif font-bold text-sm mb-1.5">{prop.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{prop.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const store = useStorefront();
  const { resolvedRoutePrefix } = store;
  const FEATURED_LIMIT = 6;

  // New arrivals carousel scroll state
  const newArrivalsTrackRef = useRef<HTMLDivElement>(null);
  const [naCanScrollLeft, setNaCanScrollLeft] = useState(false);
  const [naCanScrollRight, setNaCanScrollRight] = useState(false);

  const updateNaScrollState = useCallback(() => {
    const el = newArrivalsTrackRef.current;
    if (!el) return;
    setNaCanScrollLeft(el.scrollLeft > 4);
    setNaCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollNa = useCallback((dir: "left" | "right") => {
    const el = newArrivalsTrackRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.55;
    el.scrollBy({ left: dir === "right" ? amount : -amount, behavior: "smooth" });
  }, []);

  const { data: featured } = useGetFeaturedPosters(
    { storeKey: store.storeKey, limit: FEATURED_LIMIT },
    { query: { queryKey: getGetFeaturedPostersQueryKey({ storeKey: store.storeKey, limit: FEATURED_LIMIT }) } }
  );

  const { data: newArrivalsData } = useListPosters(
    { storeKey: store.storeKey, isNew: true, sort: ListPostersSort.newest, limit: 12, status: "published" },
    {
      query: {
        queryKey: getListPostersQueryKey({
          storeKey: store.storeKey,
          isNew: true,
          sort: ListPostersSort.newest,
          limit: 12,
          status: "published",
        }),
      },
    }
  );

  const brandStory =
    (store as any).homepage?.brandStory ??
    "A curated poster collection inspired by cities, landscapes, food, architecture and everyday moments.";

  // Collection preview posters (from isCollectionBanner flag)
  const collectionPreviewPosters: Poster[] = useMemo(() => {
    const pool = [...(featured ?? []), ...(newArrivalsData?.posters ?? [])];
    const seen = new Set<number>();
    return pool
      .filter((p) => (p as any).isCollectionBanner && p.imageUrl)
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .slice(0, 3);
  }, [featured, newArrivalsData]);

  const regionChips = (store.regions ?? []).slice(0, 5);
  const categoryChips = (store.categories ?? []).slice(0, 4);

  const featuredIds = new Set((featured ?? []).map((p) => p.id));
  const newArrivals = (newArrivalsData?.posters ?? [])
    .filter((p) => !featuredIds.has(p.id))
    .slice(0, 12);

  useEffect(() => { updateNaScrollState(); }, [newArrivals, updateNaScrollState]);
  useEffect(() => {
    window.addEventListener("resize", updateNaScrollState);
    return () => window.removeEventListener("resize", updateNaScrollState);
  }, [updateNaScrollState]);

  // ── Build banner lookup ────────────────────────────────────────────────────
  // collectionBanners array takes precedence; fall back to legacy single field as id="default"
  const bannerLookup = useMemo((): Record<string, CollectionBannerVisualConfig> => {
    const map: Record<string, CollectionBannerVisualConfig> = {};
    const banners = store.homepageVisualConfig?.collectionBanners;
    if (banners && banners.length > 0) {
      for (const b of banners) { if (b.id) map[b.id] = b; }
    } else if (store.homepageVisualConfig?.collectionBanner) {
      map["default"] = { ...store.homepageVisualConfig.collectionBanner, id: "default", showPosterCards: true };
    }
    return map;
  }, [store.homepageVisualConfig]);

  // ── Build active sections list ─────────────────────────────────────────────
  // Use configured sections if present; otherwise fall back to DEFAULT_HOMEPAGE_SECTIONS
  const activeSections = useMemo((): HomepageSectionConfig[] => {
    const cfg = store.homepageVisualConfig?.sections;
    if (cfg && cfg.length > 0) {
      return [...cfg].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    // Fallback: use defaults, but only show collection banner if we have banner data
    return DEFAULT_HOMEPAGE_SECTIONS.filter((s) => {
      if (s.type === "collectionBanner") {
        return Object.keys(bannerLookup).length > 0 || !!store.shop?.collectionBanner;
      }
      return true;
    });
  }, [store.homepageVisualConfig, bannerLookup, store.shop]);

  const staticCollectionBanner = store.shop?.collectionBanner ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-16">
      {activeSections.map((section) => {
        if (!section.visible) return null;

        switch (section.type) {
          case "hero":
            return (
              <HeroSection
                key={section.id}
                store={store}
                resolvedRoutePrefix={resolvedRoutePrefix}
                sectionConfig={section}
              />
            );

          case "featuredPosters":
            return (
              <FeaturedPostersSection
                key={section.id}
                featured={featured}
                resolvedRoutePrefix={resolvedRoutePrefix}
                sectionConfig={section}
              />
            );

          case "collectionBanner": {
            const bannerId = section.bannerId ?? "default";
            const banner = bannerLookup[bannerId];
            // No banner data → render static fallback if available
            if (!banner && !staticCollectionBanner) return null;
            const effectiveBanner: CollectionBannerVisualConfig = banner ?? {};
            return (
              <CollectionBannerSection
                key={section.id}
                banner={effectiveBanner}
                staticBanner={staticCollectionBanner}
                collectionPreviewPosters={collectionPreviewPosters}
                resolvedRoutePrefix={resolvedRoutePrefix}
              />
            );
          }

          case "exploreLinks":
            return (
              <ExploreLinksSection
                key={section.id}
                regionChips={regionChips}
                categoryChips={categoryChips}
                resolvedRoutePrefix={resolvedRoutePrefix}
                regionFilterLabel={store.shop?.regionFilterLabel ?? "Explore Spain"}
              />
            );

          case "newArrivals":
            return (
              <NewArrivalsSection
                key={section.id}
                newArrivals={newArrivals}
                resolvedRoutePrefix={resolvedRoutePrefix}
                naCanScrollLeft={naCanScrollLeft}
                naCanScrollRight={naCanScrollRight}
                trackRef={newArrivalsTrackRef}
                onScroll={updateNaScrollState}
                onScrollLeft={() => scrollNa("left")}
                onScrollRight={() => scrollNa("right")}
                sectionConfig={section}
              />
            );

          case "brandStory":
            return (
              <BrandStorySection
                key={section.id}
                brandStory={brandStory}
                sectionConfig={section}
              />
            );

          case "valueProps":
            return <ValuePropsSection key={section.id} />;

          default:
            return null;
        }
      })}
    </div>
  );
}
