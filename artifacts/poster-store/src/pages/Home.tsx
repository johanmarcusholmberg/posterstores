import React from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import {
  useGetFeaturedPosters,
  getGetFeaturedPostersQueryKey,
  Poster,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

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

/** Compact card used only on the homepage featured row */
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
          {poster.title}
        </h3>
        <p className="text-xs font-medium text-foreground/70 mt-0.5">{priceLabel}</p>
      </div>
    </Link>
  );
}

export default function Home() {
  const store = useStorefront();

  const { data: featured } = useGetFeaturedPosters(
    { storeKey: store.storeKey, limit: 12 },
    {
      query: {
        queryKey: getGetFeaturedPostersQueryKey({ storeKey: store.storeKey, limit: 12 }),
      },
    }
  );

  const brandStory =
    (store as any).homepage?.brandStory ??
    "A curated poster collection inspired by cities, landscapes, food, architecture and everyday moments.";

  return (
    <div className="min-h-screen pb-16">

      {/* ── Compact intro ── */}
      <section className="bg-sand">
        <div className="container mx-auto px-6 lg:px-10 py-5 lg:py-7 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-foreground/45 mb-2">
            INSPIRED BY SPAIN
          </p>
          <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-primary mb-3 leading-tight">
            Posters inspired by Spain
          </h1>
          <p className="text-sm text-foreground/65 mb-5 max-w-sm mx-auto leading-relaxed">
            Mediterranean places, colors and moments — printed for your home.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link href="/shop">
              <Button size="default" className="w-full sm:w-auto h-9 px-6 text-sm" data-testid="btn-hero-primary">
                Browse posters
              </Button>
            </Link>
            <Link href="/shop">
              <Button
                size="default"
                variant="outline"
                className="w-full sm:w-auto h-9 px-6 text-sm border-primary/30 text-primary hover:bg-primary/5"
              >
                View all regions
              </Button>
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 justify-center text-xs text-foreground/40">
            <span>✦ Fine art prints</span>
            <span>✦ Ships worldwide</span>
            <span>✦ Sustainably made</span>
          </div>
        </div>
      </section>

      {/* ── Featured posters row ── */}
      <section className="pt-5 pb-6 lg:pt-6 lg:pb-8 border-b border-border">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-bold text-foreground">Featured posters</h2>
            <Link
              href="/shop"
              className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
            >
              View all &rarr;
            </Link>
          </div>

          {/* Horizontally scrollable row — swipeable on mobile */}
          <div
            className="flex gap-3 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory -mx-6 px-6 lg:-mx-10 lg:px-10"
            style={{ scrollbarWidth: "none" }}
          >
            {featured && featured.length > 0
              ? featured.map((poster) => (
                  <div
                    key={poster.id}
                    className="flex-none w-[155px] sm:w-[170px] lg:w-[185px] snap-start"
                  >
                    <HomePosterCard poster={poster} />
                  </div>
                ))
              : Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-none w-[155px] sm:w-[170px] lg:w-[185px] snap-start"
                  >
                    <div className="aspect-[3/4] bg-muted animate-pulse" />
                    <div className="mt-1.5 h-3.5 bg-muted animate-pulse w-3/4" />
                    <div className="mt-1 h-3 bg-muted animate-pulse w-1/2" />
                  </div>
                ))}
          </div>
        </div>
      </section>

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
