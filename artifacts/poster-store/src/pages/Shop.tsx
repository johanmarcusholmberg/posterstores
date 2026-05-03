import React, { useState, useMemo } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { useListPosters, getListPostersQueryKey } from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation, useSearch } from "wouter";

export default function Shop() {
  const store = useStorefront();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const [location, setLocation] = useLocation();

  const regionFilter = searchParams.get("region") || undefined;
  const cityFilter = searchParams.get("city") || undefined;
  const categoryFilter = searchParams.get("category") || undefined;
  const tagFilter = searchParams.get("tag") || undefined;
  const searchQuery = searchParams.get("search") || undefined;
  const sortFilter = (searchParams.get("sort") as any) || "newest";

  const { data: listResponse, isLoading } = useListPosters(
    {
      storeKey: store.storeKey,
      region: regionFilter,
      city: cityFilter,
      category: categoryFilter,
      tag: tagFilter,
      search: searchQuery,
      sort: sortFilter,
      limit: 50,
    },
    {
      query: {
        queryKey: getListPostersQueryKey({
          storeKey: store.storeKey,
          region: regionFilter,
          city: cityFilter,
          category: categoryFilter,
          tag: tagFilter,
          search: searchQuery,
          sort: sortFilter,
          limit: 50,
        }),
      },
    }
  );

  const setFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchString);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    setLocation(`/shop?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Filters */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="sticky top-24 space-y-8">
            <div>
              <h3 className="font-serif font-bold text-lg mb-4">Search</h3>
              <Input 
                placeholder="Search posters..." 
                defaultValue={searchQuery}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setFilter("search", e.currentTarget.value);
                  }
                }}
                data-testid="input-shop-search"
              />
            </div>

            <div>
              <h3 className="font-serif font-bold text-lg mb-4">Region</h3>
              <div className="space-y-2">
                <Button 
                  variant="ghost" 
                  className={`w-full justify-start h-8 px-2 ${!regionFilter ? 'bg-primary/10 text-primary' : ''}`}
                  onClick={() => setFilter("region", undefined)}
                >
                  All Regions
                </Button>
                {store.regions.map(region => (
                  <Button 
                    key={region}
                    variant="ghost" 
                    className={`w-full justify-start h-8 px-2 ${regionFilter === region ? 'bg-primary/10 text-primary' : ''}`}
                    onClick={() => setFilter("region", region)}
                  >
                    {region}
                  </Button>
                ))}
              </div>
            </div>

            {store.categories && (
              <div>
                <h3 className="font-serif font-bold text-lg mb-4">Categories</h3>
                <div className="space-y-2">
                  <Button 
                    variant="ghost" 
                    className={`w-full justify-start h-8 px-2 ${!categoryFilter ? 'bg-primary/10 text-primary' : ''}`}
                    onClick={() => setFilter("category", undefined)}
                  >
                    All Categories
                  </Button>
                  {store.categories.map(category => (
                    <Button 
                      key={category}
                      variant="ghost" 
                      className={`w-full justify-start h-8 px-2 ${categoryFilter === category ? 'bg-primary/10 text-primary' : ''}`}
                      onClick={() => setFilter("category", category)}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <h1 className="font-serif text-3xl font-bold text-foreground">
              {categoryFilter || regionFilter || "All Posters"}
              <span className="text-muted-foreground text-lg ml-2 font-sans font-normal">
                ({listResponse?.total || 0})
              </span>
            </h1>

            <Select value={sortFilter} onValueChange={(v) => setFilter("sort", v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest Arrivals</SelectItem>
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : listResponse?.posters.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 rounded-lg">
              <h2 className="font-serif text-2xl font-bold text-foreground mb-2">No posters found</h2>
              <p className="text-muted-foreground mb-6">Try adjusting your filters to find what you're looking for.</p>
              <Button onClick={() => setLocation("/shop")} data-testid="btn-clear-filters">
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {listResponse?.posters.map(poster => (
                <PosterCard key={poster.id} poster={poster} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
