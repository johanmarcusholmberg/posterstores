import React from "react";
import { Link } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { useGetFeaturedPosters, getGetFeaturedPostersQueryKey, useGetNewArrivals, getGetNewArrivalsQueryKey } from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { Button } from "@/components/ui/button";

export default function Home() {
  const store = useStorefront();

  const { data: featured } = useGetFeaturedPosters(
    { storeKey: store.storeKey, limit: 4 },
    {
      query: {
        queryKey: getGetFeaturedPostersQueryKey({ storeKey: store.storeKey, limit: 4 }),
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

  return (
    <div className="min-h-screen pb-16">
      {/* Hero Section */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden bg-sand">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1546272989-40c92939c17f?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center opacity-30 mix-blend-multiply" />
        <div className="relative z-10 text-center px-4 max-w-3xl">
          <h1 className="font-serif text-5xl md:text-7xl font-bold text-primary mb-6">
            {store.homepage.heroTitle}
          </h1>
          <p className="text-lg md:text-xl text-foreground/80 mb-8 max-w-xl mx-auto font-medium">
            {store.homepage.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/shop">
              <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8" data-testid="btn-hero-primary">
                {store.homepage.primaryCta || "Browse posters"}
              </Button>
            </Link>
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
            {featured.map((poster) => (
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

      {/* Categories/Regions Banner */}
      <section className="bg-primary text-primary-foreground py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl font-bold mb-8">Explore by Region</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {store.regions.slice(0, 6).map((region) => (
              <Link key={region} href={`/shop?region=${encodeURIComponent(region)}`}>
                <Button variant="outline" className="bg-transparent border-primary-foreground/30 hover:bg-primary-foreground/10 text-primary-foreground">
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
