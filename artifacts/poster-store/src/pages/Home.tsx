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

  return (
    <div className="min-h-screen pb-16">
      {/* Hero Section */}
      <section className="relative bg-sand h-[calc(100vh-64px)] flex items-stretch overflow-hidden">
        <div className="container mx-auto px-6 lg:px-10 flex items-stretch">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 w-full items-center py-10 lg:py-0">

            {/* Left: Headline + CTA */}
            <div className="flex flex-col justify-center order-2 lg:order-1 text-center lg:text-left">
              <h1 className="font-serif text-5xl md:text-6xl xl:text-7xl font-bold text-primary mb-6 leading-[1.1]">
                {store.homepage.heroTitle}
              </h1>
              <p className="text-lg md:text-xl text-foreground/65 mb-10 max-w-md mx-auto lg:mx-0 leading-relaxed">
                {store.homepage.heroSubtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/shop">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto text-lg h-14 px-8"
                    data-testid="btn-hero-primary"
                  >
                    {store.homepage.primaryCta || "Browse posters"}
                  </Button>
                </Link>
                <Link href="/shop">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto text-lg h-14 px-8 border-primary/30 text-primary hover:bg-primary/5"
                  >
                    View all regions
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 justify-center lg:justify-start text-sm text-foreground/50">
                <span>✦ Fine art prints</span>
                <span>✦ Ships worldwide</span>
                <span>✦ Sustainably made</span>
              </div>
            </div>

            {/* Right: Staggered poster collage — clips intentionally at top/bottom */}
            <div className="order-1 lg:order-2 h-full flex items-center overflow-hidden">
              {heroPosters.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 lg:gap-4 w-full h-full">
                  {/* Column 1 — anchored at top, no upward shift */}
                  <div className="flex flex-col gap-3 lg:gap-4 pt-6">
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
                  {/* Column 2 — shifted down for stagger effect */}
                  <div className="flex flex-col gap-3 lg:gap-4 mt-[14%]">
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
                /* Skeleton while loading */
                <div className="grid grid-cols-2 gap-3 lg:gap-4 w-full h-[110%]">
                  <div className="flex flex-col gap-3 lg:gap-4 -mt-[8%]">
                    <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                    <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                  </div>
                  <div className="flex flex-col gap-3 lg:gap-4 mt-[8%]">
                    <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                    <div className="flex-1 bg-muted/60 animate-pulse rounded-xl" />
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* Featured Collection */}
      <section className="container mx-auto px-4 py-20">
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
      <section className="bg-primary text-primary-foreground py-24">
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
      <section className="container mx-auto px-4 py-20">
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
