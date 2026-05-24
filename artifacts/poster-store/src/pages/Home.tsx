import React from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import {
  useGetFeaturedPosters,
  getGetFeaturedPostersQueryKey,
} from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
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
        <div className="container mx-auto px-6 lg:px-10 py-10 lg:py-14 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-foreground/45 mb-3">
            INSPIRED BY SPAIN
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-primary mb-4 leading-tight">
            Posters inspired by Spain
          </h1>
          <p className="text-base text-foreground/65 mb-7 max-w-md mx-auto leading-relaxed">
            Mediterranean places, colors and moments — printed for your home.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/shop">
              <Button size="lg" className="w-full sm:w-auto h-11 px-7" data-testid="btn-hero-primary">
                Browse posters
              </Button>
            </Link>
            <Link href="/shop">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto h-11 px-7 border-primary/30 text-primary hover:bg-primary/5"
              >
                View all regions
              </Button>
            </Link>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 justify-center text-xs text-foreground/40">
            <span>✦ Fine art prints</span>
            <span>✦ Ships worldwide</span>
            <span>✦ Sustainably made</span>
          </div>
        </div>
      </section>

      {/* ── Featured posters row ── */}
      <section className="py-10 lg:py-12 border-b border-border">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl font-bold text-foreground">Featured posters</h2>
            <Link
              href="/shop"
              className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
            >
              View all &rarr;
            </Link>
          </div>

          {/* Horizontally scrollable row — swipeable on mobile */}
          <div
            className="flex gap-4 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory -mx-6 px-6 lg:-mx-10 lg:px-10"
            style={{ scrollbarWidth: "none" }}
          >
            {featured && featured.length > 0
              ? featured.map((poster) => (
                  <div
                    key={poster.id}
                    className="flex-none w-[200px] sm:w-[220px] lg:w-[240px] snap-start"
                  >
                    <PosterCard poster={poster} />
                  </div>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-none w-[200px] sm:w-[220px] lg:w-[240px] snap-start"
                  >
                    <div className="aspect-[3/4] bg-muted animate-pulse" />
                    <div className="mt-2 h-4 bg-muted animate-pulse w-3/4" />
                    <div className="mt-1.5 h-3 bg-muted animate-pulse w-1/2" />
                  </div>
                ))}
          </div>
        </div>
      </section>

      {/* ── Brand quote ── */}
      <section className="py-14 lg:py-16" data-testid="brand-story-section">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="font-serif text-xl md:text-2xl text-foreground/75 leading-relaxed italic">
            &ldquo;{brandStory}&rdquo;
          </p>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="border-t border-border py-12 lg:py-16">
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
