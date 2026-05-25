import React from "react";
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

const VALUE_PROPS = [
  {
    title: "Museum quality",
    description: "Archival inks on premium fine art paper",
  },
  {
    title: "Made to order",
    description: "Printed especially for you when you order",
  },
  {
    title: "Worldwide shipping",
    description: "Carefully packed and shipped to your door",
  },
  {
    title: "Better choice",
    description: "Sustainably made with responsible materials",
  },
];

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
  const symbol = symbols[currency] ?? currency;
  if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
  return `${symbol}${price.toFixed(2)}`;
}

/** Build a /shop URL, prepending a routePrefix when present. */
function makeShopUrl(routePrefix: string | null, query?: string): string {
  const base = routePrefix ? `/${routePrefix}/shop` : "/shop";
  return query ? `${base}?${query}` : base;
}

/** Compact card used only on the homepage featured/new-arrivals rows */
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

  return (
    <Link
      href={href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[#f4f0eb] shadow-[0_1px_4px_rgba(0,0,0,0.06)] group-hover:shadow-[0_3px_14px_rgba(0,0,0,0.11)] transition-shadow duration-300">
        <img
          src={baseImage}
          alt={poster.title}
          className={[
            "absolute inset-0 object-cover w-full h-full",
            "motion-reduce:transition-none",
            hoverImage
              ? "transition-opacity duration-[280ms] ease-out opacity-100 group-hover:opacity-0"
              : "transition-transform duration-[300ms] ease-out scale-100 group-hover:scale-[1.07]",
          ].join(" ")}
          onError={(e) => {
            (e.target as HTMLImageElement).src = poster.imageUrl;
          }}
        />
        {hoverImage && (
          <img
            src={hoverImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 object-cover w-full h-full transition-opacity duration-[280ms] ease-out opacity-0 group-hover:opacity-100 motion-reduce:transition-none motion-reduce:opacity-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div
          className="absolute inset-0 ring-1 ring-inset ring-black/[0.06] pointer-events-none"
          aria-hidden="true"
        />
        {poster.isNew && (
          <div className="absolute top-1.5 left-1.5 bg-secondary text-secondary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
            NEW
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-1.5">
        <h3 className="font-serif font-semibold text-sm text-foreground line-clamp-2 leading-snug">
          {(poster as any).displayTitle || poster.title}
        </h3>
        <p className="text-xs font-medium text-foreground/70 mt-0.5">{priceLabel}</p>
      </div>
    </Link>
  );
}

/**
 * Polaroid-inspired card used exclusively in the Featured posters section.
 * Warm paper background, padded frame, larger bottom caption area, soft shadow.
 * Cards are straight (no tilt) and stretch to equal grid-row height.
 */
function FeaturedPosterCard({ poster }: { poster: Poster }) {
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

  return (
    <Link
      href={href}
      className="group flex flex-col h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div
        className={[
          "flex flex-col flex-1",
          "bg-[#faf8f3] rounded-[2px]",
          "shadow-[0_2px_8px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.06)]",
          "group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.09)]",
          "group-hover:-translate-y-0.5",
          "transition-all duration-300 ease-out",
          "p-2 pb-0",
        ].join(" ")}
      >
        {/* Image inset — paper-border feel from outer padding */}
        <div className="relative aspect-[3/4] overflow-hidden bg-[#ede8e0]">
          <img
            src={displayImage}
            alt={poster.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out scale-100 group-hover:scale-[1.04] motion-reduce:transition-none"
            onError={(e) => {
              (e.target as HTMLImageElement).src = poster.imageUrl;
            }}
          />
          {poster.isNew && (
            <div className="absolute top-1.5 left-1.5 bg-secondary text-secondary-foreground text-[9px] font-bold px-1.5 py-0.5">
              NEW
            </div>
          )}
        </div>

        {/* Polaroid caption tab — fixed min-height keeps bottom edges aligned */}
        <div className="px-0.5 pt-2.5 pb-3 min-h-[52px] flex flex-col justify-start">
          <h3 className="font-serif font-semibold text-[11px] sm:text-xs text-foreground/85 line-clamp-2 leading-snug">
            {cardTitle}
          </h3>
          <p className="text-[10px] text-foreground/50 mt-1">{priceLabel}</p>
        </div>
      </div>
    </Link>
  );
}

/** Skeleton card matching the Polaroid style for the featured loading state */
function FeaturedPosterCardSkeleton() {
  return (
    <div className="bg-[#faf8f3] rounded-[2px] shadow-[0_2px_8px_rgba(0,0,0,0.07)] p-2 pb-0">
      <div className="aspect-[3/4] bg-muted animate-pulse" />
      <div className="px-0.5 py-2.5 pb-3">
        <div className="h-3 bg-muted animate-pulse w-3/4" />
        <div className="mt-1.5 h-2.5 bg-muted animate-pulse w-1/2" />
      </div>
    </div>
  );
}

/** Skeleton card for loading states (used in New arrivals horizontal scroll) */
function PosterCardSkeleton() {
  return (
    <div className="flex-none w-[155px] sm:w-[170px] lg:w-[185px] snap-start">
      <div className="aspect-[3/4] bg-muted animate-pulse" />
      <div className="mt-1.5 h-3.5 bg-muted animate-pulse w-3/4" />
      <div className="mt-1 h-3 bg-muted animate-pulse w-1/2" />
    </div>
  );
}

export default function Home() {
  const store = useStorefront();
  const { resolvedRoutePrefix } = store;

  const FEATURED_LIMIT = 6;

  const { data: featured } = useGetFeaturedPosters(
    { storeKey: store.storeKey, limit: FEATURED_LIMIT },
    {
      query: {
        queryKey: getGetFeaturedPostersQueryKey({ storeKey: store.storeKey, limit: FEATURED_LIMIT }),
      },
    }
  );

  const { data: newArrivalsData } = useListPosters(
    {
      storeKey: store.storeKey,
      sort: ListPostersSort.newest,
      limit: 10,
      status: "published",
    },
    {
      query: {
        queryKey: getListPostersQueryKey({
          storeKey: store.storeKey,
          sort: ListPostersSort.newest,
          limit: 10,
          status: "published",
        }),
      },
    }
  );

  const brandStory =
    (store as any).homepage?.brandStory ??
    "A curated poster collection inspired by cities, landscapes, food, architecture and everyday moments.";

  const collectionBanner = store.shop?.collectionBanner;
  const heroVisual = store.homepageVisualConfig?.hero;
  const collectionVisual = store.homepageVisualConfig?.collectionBanner;
  const hasHeroBg = !!heroVisual?.backgroundImageUrl;
  const hasCollBg = !!collectionVisual?.backgroundImageUrl;

  const heroTextMode = store.typographyConfig?.heroTextMode;
  const heroOverlayMode = store.typographyConfig?.heroOverlayMode;
  const useStoreHeroVars = !!heroTextMode;
  const useStoreOverlay = !!heroOverlayMode;

  // Up to 3 posters explicitly marked "Show in collection banner strip".
  // No fallback — if zero are selected the banner shows background image only.
  const collectionPreviewPosters: Poster[] = React.useMemo(() => {
    const pool = [...(featured ?? []), ...(newArrivalsData?.posters ?? [])];
    const seen = new Set<number>();
    return pool
      .filter(p => (p as any).isCollectionBanner && p.imageUrl)
      .filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .slice(0, 3);
  }, [featured, newArrivalsData]);

  // Build discovery chips: up to 5 regions + up to 4 categories
  const regionChips = (store.regions ?? []).slice(0, 5);
  const categoryChips = (store.categories ?? []).slice(0, 4);

  // New arrivals: dedupe against featured (by id), show up to 8
  const featuredIds = new Set((featured ?? []).map((p) => p.id));
  const newArrivals = (newArrivalsData?.posters ?? [])
    .filter((p) => !featuredIds.has(p.id))
    .slice(0, 8);
  const showNewArrivals = newArrivals.length >= 3;

  return (
    <div className="min-h-screen pb-16">

      {/* ── Compact intro ── */}
      <section
        className={cn("relative overflow-hidden", !hasHeroBg && "bg-sand")}
        style={
          hasHeroBg
            ? {
                backgroundImage: `url(${heroVisual!.backgroundImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {hasHeroBg && (
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: useStoreOverlay
                ? "var(--store-hero-overlay-color)"
                : `rgba(0,0,0,${heroVisual?.backgroundOverlayOpacity ?? 0.3})`,
            }}
          />
        )}
        <div className="relative z-10 container mx-auto px-6 lg:px-10 py-5 lg:py-7 text-center">
          <h1
            className={cn(
              "font-serif text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 leading-tight",
              !useStoreHeroVars && (hasHeroBg ? "text-white" : "text-primary")
            )}
            style={useStoreHeroVars ? { color: "var(--store-hero-heading-color)" } : undefined}
          >
            {store.homepage?.heroTitle || "Posters inspired by Spain"}
          </h1>
          <p
            className={cn(
              "text-sm mb-5 max-w-sm mx-auto leading-relaxed",
              !useStoreHeroVars && (hasHeroBg ? "text-white/80" : "text-foreground/65")
            )}
            style={useStoreHeroVars ? { color: "var(--store-hero-subtitle-color)" } : undefined}
          >
            {store.homepage?.heroSubtitle || "Mediterranean places, colors and moments — printed for your home."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link href={makeShopUrl(resolvedRoutePrefix)}>
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
                  "w-full sm:w-auto h-9 px-6 text-sm",
                  hasHeroBg && !useStoreHeroVars && "bg-white text-primary hover:bg-white/90 border-0"
                )}
              >
                {heroVisual?.primaryButtonText || store.homepage?.primaryCta || "Browse posters"}
              </Button>
            </Link>
            <Link href={makeShopUrl(resolvedRoutePrefix)}>
              <Button
                size="default"
                variant="outline"
                className={cn(
                  "w-full sm:w-auto h-9 px-6 text-sm",
                  !useStoreHeroVars && (hasHeroBg
                    ? "border-white/60 text-white hover:bg-white/10 bg-transparent"
                    : "border-primary/30 text-primary hover:bg-primary/5")
                )}
              >
                {heroVisual?.secondaryButtonText || store.homepage?.secondaryCta || "View all regions"}
              </Button>
            </Link>
          </div>
          <div
            className={cn(
              "mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 justify-center text-xs",
              !useStoreHeroVars && (hasHeroBg ? "text-white/50" : "text-foreground/40")
            )}
            style={useStoreHeroVars ? { color: "var(--store-hero-bullet-color)" } : undefined}
          >
            <span>✦ Fine art prints</span>
            <span>✦ Ships worldwide</span>
            <span>✦ Sustainably made</span>
          </div>
        </div>
      </section>

      {/* ── Featured posters grid ── */}
      {/*
        Layout:
          Desktop (≥1024px lg): 6 columns × 1 row — all 6 posters visible
          Tablet  (640–1023px sm): 3 columns × 2 rows — all 6 posters visible
          Mobile  (<640px): 2 columns × 2 rows — only first 4 shown (items 4+5 hidden on mobile)
        Polaroid-style cards apply only here; the normal shop grid is unchanged.
      */}
      <section className="pt-6 pb-8 lg:pt-7 lg:pb-10 border-b border-border">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between mb-5 lg:mb-6">
            <h2 className="font-serif text-xl font-bold text-foreground">Featured posters</h2>
            <Link
              href={makeShopUrl(resolvedRoutePrefix)}
              className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
            >
              View all &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 lg:gap-4 items-stretch">
            {featured && featured.length > 0
              ? featured.slice(0, FEATURED_LIMIT).map((poster, i) => (
                  <div
                    key={poster.id}
                    className={["h-full", i >= 4 ? "hidden sm:block" : ""].filter(Boolean).join(" ")}
                  >
                    <FeaturedPosterCard poster={poster} />
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

      {/* ── Collection / discovery banner ── */}
      {(collectionBanner || collectionVisual) && (() => {
        const cbTitle = collectionVisual?.title ?? collectionBanner?.title ?? "Mediterranean Walls";
        const cbText = collectionVisual?.text ?? collectionBanner?.text;
        const cbCtaText = collectionVisual?.ctaText ?? collectionBanner?.ctaText ?? "Explore collection";
        const cbCtaLink = collectionVisual?.ctaLink ?? collectionBanner?.ctaLink;
        const cbEyebrow = collectionVisual?.eyebrow;
        const resolvedCtaHref = cbCtaLink
          ? resolvedRoutePrefix
            ? `/${resolvedRoutePrefix}${cbCtaLink}`
            : cbCtaLink
          : makeShopUrl(resolvedRoutePrefix);

        return (
          <section className="py-6 lg:py-8 border-b border-border">
            <div className="container mx-auto px-6 lg:px-10">
              {/* Card — rounded corners, background image scoped inside */}
              <div
                className="relative overflow-hidden rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.10)]"
                style={!hasCollBg ? { backgroundColor: "#EBD9C4" } : undefined}
              >
                {hasCollBg ? (
                  <>
                    {/* img drives the container height; aspect-[32/7] gives a slim feature-card feel */}
                    <img
                      src={collectionVisual!.backgroundImageUrl ?? undefined}
                      alt=""
                      aria-hidden="true"
                      className="w-full aspect-[5/2] sm:aspect-[32/7] object-cover object-[center_70%] block"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor: `rgba(0,0,0,${collectionVisual?.backgroundOverlayOpacity ?? 0.35})`,
                      }}
                    />
                  </>
                ) : null}
                {/* Content — absolutely positioned over image, or normal-flow when no image */}
                <div
                  className={cn(
                    "z-10 px-6 lg:px-10",
                    hasCollBg
                      ? "absolute inset-0 flex items-center"
                      : "relative py-8 lg:py-10"
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-7 sm:gap-10 lg:gap-14 w-full">

                    {/* Left column — text + CTA */}
                    <div className="flex-1 min-w-0">
                      {cbEyebrow && (
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-[0.18em] mb-2.5",
                            hasCollBg ? "text-white/60" : "text-foreground/45"
                          )}
                        >
                          {cbEyebrow}
                        </p>
                      )}
                      <h2
                        className={cn(
                          "font-serif text-2xl sm:text-3xl font-bold leading-tight mb-3",
                          hasCollBg ? "text-white" : "text-primary"
                        )}
                      >
                        {cbTitle}
                      </h2>
                      {cbText && (
                        <p
                          className={cn(
                            "text-sm leading-relaxed mb-5 max-w-sm",
                            hasCollBg ? "text-white/75" : "text-foreground/65"
                          )}
                        >
                          {cbText}
                        </p>
                      )}
                      <Link
                        href={resolvedCtaHref}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-sm font-semibold hover:underline",
                          hasCollBg ? "text-white" : "text-primary"
                        )}
                      >
                        {cbCtaText} &rarr;
                      </Link>
                    </div>

                    {/* Right column — poster cards (only when explicitly selected) */}
                    {collectionPreviewPosters.length > 0 && (
                      <div className="flex-none flex items-end gap-2.5 sm:gap-3">
                        {collectionPreviewPosters.map((poster, idx) => {
                          const slug = (poster as any).slug as string | undefined;
                          const href = slug ? `/posters/${slug}` : `/poster/${poster.id}`;
                          const displayImg = poster.primaryDisplayImageUrl ?? poster.imageUrl;
                          return (
                            <Link
                              key={poster.id}
                              href={href}
                              className={[
                                "flex-none group",
                                idx === 2 ? "hidden sm:block" : "",
                              ].join(" ")}
                            >
                              {/* Paper-frame poster card */}
                              <div className="w-[60px] sm:w-[72px] lg:w-[84px] bg-[#faf8f4] p-1 pb-2.5 rounded-[2px] shadow-[0_4px_14px_rgba(0,0,0,0.22)] group-hover:-translate-y-1 transition-transform duration-200">
                                <div className="relative aspect-[3/4] bg-[#ece7de] overflow-hidden">
                                  <img
                                    src={displayImg}
                                    alt={poster.title}
                                    className="absolute inset-0 w-full h-full object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = poster.imageUrl;
                                    }}
                                  />
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Shop by region / category ── */}
      {(regionChips.length > 0 || categoryChips.length > 0) && (
        <section className="py-6 lg:py-8 border-b border-border" data-testid="shop-by-region-section">
          <div className="container mx-auto px-6 lg:px-10">
            <h2 className="font-serif text-lg font-bold text-foreground mb-4">
              {store.shop?.regionFilterLabel ?? "Explore Spain"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {regionChips.map((region) => (
                <Link
                  key={region}
                  href={makeShopUrl(resolvedRoutePrefix, `region=${encodeURIComponent(region)}`)}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-border text-sm text-foreground/75 bg-surface hover:bg-sand/60 hover:border-primary/30 hover:text-primary transition-colors duration-150"
                >
                  {region}
                </Link>
              ))}
              {categoryChips.map((cat) => (
                <Link
                  key={cat}
                  href={makeShopUrl(resolvedRoutePrefix, `category=${encodeURIComponent(cat)}`)}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-border text-sm text-foreground/75 bg-surface hover:bg-sand/60 hover:border-primary/30 hover:text-primary transition-colors duration-150"
                >
                  {cat}
                </Link>
              ))}
              <Link
                href={makeShopUrl(resolvedRoutePrefix)}
                className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-primary/25 text-sm text-primary bg-primary/5 hover:bg-primary/10 transition-colors duration-150"
              >
                View all →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── New arrivals ── */}
      {showNewArrivals && (
        <section className="pt-6 pb-7 lg:pt-7 lg:pb-9 border-b border-border" data-testid="new-arrivals-section">
          <div className="container mx-auto px-6 lg:px-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-bold text-foreground">New arrivals</h2>
              <Link
                href={makeShopUrl(resolvedRoutePrefix, "sort=newest")}
                className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
              >
                View all &rarr;
              </Link>
            </div>
            <div
              className="flex gap-3 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory -mx-6 px-6 lg:-mx-10 lg:px-10"
              style={{ scrollbarWidth: "none" }}
            >
              {newArrivals.map((poster) => (
                <div
                  key={poster.id}
                  className="flex-none w-[155px] sm:w-[170px] lg:w-[185px] snap-start"
                >
                  <HomePosterCard poster={poster} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Brand quote ── */}
      <section className="py-12 lg:py-14" data-testid="brand-story-section">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="font-serif text-xl md:text-2xl text-foreground/75 leading-relaxed italic">
            &ldquo;{brandStory}&rdquo;
          </p>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="border-t border-border py-10 lg:py-14">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {VALUE_PROPS.map((prop, i) => (
              <div key={i} className="text-center px-2" data-testid={`value-card-${i}`}>
                <h3 className="font-serif font-bold text-base mb-1.5">{prop.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{prop.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
