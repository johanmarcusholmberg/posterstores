import React from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import {
  useGetFeaturedPosters,
  getGetFeaturedPostersQueryKey,
  useGetNewArrivals,
  getGetNewArrivalsQueryKey,
} from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { Button } from "@/components/ui/button";
import { MapPin, Home as HomeIcon, ShoppingBag } from "lucide-react";

const DEFAULT_VALUE_CARDS = [
  {
    icon: MapPin,
    title: "Inspired by real places",
    description: "Every poster in the collection is rooted in a real city, landscape or moment — not a studio concept.",
  },
  {
    icon: HomeIcon,
    title: "Printed for modern homes",
    description: "Produced on archival-quality paper with professional inks, designed to look beautiful on your wall.",
  },
  {
    icon: ShoppingBag,
    title: "Easy ordering, secure payment",
    description: "Choose your size, check out in minutes, and your order ships straight to your door.",
  },
];

export default function Home() {
  const store = useStorefront();

  const { data: featured } = useGetFeaturedPosters(
    { storeKey: store.storeKey, limit: 6 },
    {
      query: {
        queryKey: getGetFeaturedPostersQueryKey({ storeKey: store.storeKey, limit: 6 }),
      },
    }
  );

  const { data: newArrivals } = useGetNewArrivals(
    { storeKey: store.storeKey, limit: 4 },
    {
      query: {
        queryKey: getGetNewArrivalsQueryKey({ storeKey: store.storeKey, limit: 4 }),
      },
    }
  );

  const heroPosters = featured?.slice(0, 4) ?? [];

  const brandStory = (store as any).homepage?.brandStory ?? "A curated poster collection inspired by cities, landscapes, food, architecture and everyday moments.";
  const valueCards = (store as any).homepage?.valueCards ?? DEFAULT_VALUE_CARDS;

  return (
    <div className="min-h-screen pb-16">
      {/* ── Hero Section ── */}
      <section className="relative bg-sand overflow-hidden">
        <div className="container mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 py-10 lg:py-0 lg:min-h-[580px] items-center">

            {/* Left: Headline + CTA */}
            <div className="flex flex-col order-2 lg:order-1 text-center lg:text-left justify-center">
              <h1 className="font-serif text-4xl md:text-5xl xl:text-6xl font-bold text-primary mb-4 leading-[1.1]">
                {store.homepage.heroTitle}
              </h1>
              <p className="text-base md:text-lg text-foreground/65 mb-7 max-w-md mx-auto lg:mx-0 leading-relaxed">
                {store.homepage.heroSubtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link href="/shop">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-12 px-7 text-base"
                    data-testid="btn-hero-primary"
                  >
                    {store.homepage.primaryCta || "Browse posters"}
                  </Button>
                </Link>
                <Link href="/shop">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto h-12 px-7 text-base border-primary/30 text-primary hover:bg-primary/5"
                  >
                    View all regions
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center lg:justify-start text-xs text-foreground/50">
                <span>✦ Fine art prints</span>
                <span>✦ Ships worldwide</span>
                <span>✦ Sustainably made</span>
              </div>
            </div>

            {/* Right: Image collage */}
            <div className="order-1 lg:order-2">

              {/* ── Mobile: compact 2-image row ── */}
              <div className="flex gap-2.5 lg:hidden">
                {heroPosters.length > 0 ? (
                  heroPosters.slice(0, 2).map((poster) => (
                    <Link
                      key={poster.id}
                      href={(poster as any).slug ? `/posters/${(poster as any).slug}` : `/poster/${poster.id}`}
                      className="flex-1"
                    >
                      <div className="overflow-hidden rounded-xl shadow-md aspect-[3/4]">
                        <img
                          src={poster.imageUrl ?? ""}
                          alt={poster.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </Link>
                  ))
                ) : (
                  <>
                    <div className="flex-1 aspect-[3/4] bg-muted/60 animate-pulse rounded-xl" />
                    <div className="flex-1 aspect-[3/4] bg-muted/60 animate-pulse rounded-xl" />
                  </>
                )}
              </div>

              {/* ── Desktop: staggered poster collage ── */}
              <div className="hidden lg:block h-[480px] overflow-hidden">
                {heroPosters.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 h-full">
                    <div className="flex flex-col gap-4 pt-8">
                      {heroPosters.slice(0, 2).map((poster) => (
                        <Link
                          key={poster.id}
                          href={(poster as any).slug ? `/posters/${(poster as any).slug}` : `/poster/${poster.id}`}
                          className="flex-1 block min-h-0"
                        >
                          <div className="overflow-hidden rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 group h-full">
                            <img
                              src={poster.imageUrl ?? ""}
                              alt={poster.title}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                            />
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="flex flex-col gap-4">
                      {heroPosters.slice(2, 4).map((poster) => (
                        <Link
                          key={poster.id}
                          href={(poster as any).slug ? `/posters/${(poster as any).slug}` : `/poster/${poster.id}`}
                          className="flex-1 block min-h-0"
                        >
                          <div className="overflow-hidden rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 group h-full">
                            <img
                              src={poster.imageUrl ?? ""}
                              alt={poster.title}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                            />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 h-full">
                    <div className="flex flex-col gap-4 pt-8">
                      <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                      <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                      <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Brand story + Value section */}
      <section className="container mx-auto px-4 py-16" data-testid="brand-story-section">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <p className="font-serif text-xl md:text-2xl text-foreground/80 leading-relaxed italic">
            "{brandStory}"
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {valueCards.map((card: typeof DEFAULT_VALUE_CARDS[0], i: number) => {
            const Icon = card.icon;
            return (
              <div key={i} className="text-center px-4" data-testid={`value-card-${i}`}>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-serif font-bold text-lg mb-2">{card.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Featured Collection */}
      <section className="container mx-auto px-4 py-16 border-t border-border">
        <div className="flex items-center justify-between mb-10">
          <h2 className="font-serif text-3xl font-bold text-foreground">Featured Gallery</h2>
          <Link href="/shop" className="text-primary font-medium hover:underline">
            View all &rarr;
          </Link>
        </div>

        {featured && featured.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {featured.slice(0, 4).map((poster) => (
              <PosterCard key={poster.id} poster={poster} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        )}
      </section>

      {/* Explore by Region */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl font-bold mb-8">Explore by Region</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {store.regions.slice(0, 6).map((region) => (
              <Link key={region} href={`/shop?region=${encodeURIComponent(region)}`}>
                <Button
                  variant="outline"
                  className="bg-transparent border-primary-foreground/30 hover:bg-primary-foreground/10 text-primary-foreground"
                >
                  {region}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* New Arrivals */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-10">
          <h2 className="font-serif text-3xl font-bold text-foreground">New Arrivals</h2>
        </div>
        {newArrivals && newArrivals.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {newArrivals.map((poster) => (
              <PosterCard key={poster.id} poster={poster} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
