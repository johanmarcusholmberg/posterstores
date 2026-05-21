import React, { useState, useMemo } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { useListPosters, getListPostersQueryKey } from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useLocation, useSearch } from "wouter";
import { SlidersHorizontal, X } from "lucide-react";

function FilterSidebar({
  store,
  regionFilter,
  categoryFilter,
  setFilter,
  clearAllFilters,
}: {
  store: ReturnType<typeof useStorefront>;
  regionFilter: string | undefined;
  categoryFilter: string | undefined;
  setFilter: (key: string, value: string | undefined) => void;
  clearAllFilters: () => void;
}) {
  const hasFilters = !!(regionFilter || categoryFilter);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-serif font-bold text-lg mb-4">Region</h3>
        <div className="space-y-1">
          <button
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${!regionFilter ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
            onClick={() => setFilter("region", undefined)}
          >
            All Regions
          </button>
          {store.regions.map(region => (
            <button
              key={region}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${regionFilter === region ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
              onClick={() => setFilter("region", region)}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      {store.categories && store.categories.length > 0 && (
        <div>
          <h3 className="font-serif font-bold text-lg mb-4">Categories</h3>
          <div className="space-y-1">
            <button
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${!categoryFilter ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
              onClick={() => setFilter("category", undefined)}
            >
              All Categories
            </button>
            {store.categories.map(category => (
              <button
                key={category}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${categoryFilter === category ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
                onClick={() => setFilter("category", category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={clearAllFilters}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="btn-clear-all-filters"
        >
          <X className="h-3.5 w-3.5" />
          Clear all filters
        </button>
      )}
    </div>
  );
}

export default function Shop() {
  const store = useStorefront();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const [location, setLocation] = useLocation();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
    setMobileFiltersOpen(false);
  };

  const clearAllFilters = () => {
    setLocation("/shop");
    window.scrollTo({ top: 0, behavior: "instant" });
    setMobileFiltersOpen(false);
  };

  const activeFilters: { label: string; key: string }[] = [];
  if (regionFilter) activeFilters.push({ label: regionFilter, key: "region" });
  if (categoryFilter) activeFilters.push({ label: categoryFilter, key: "category" });
  if (tagFilter) activeFilters.push({ label: tagFilter, key: "tag" });
  if (searchQuery) activeFilters.push({ label: `"${searchQuery}"`, key: "search" });

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden md:block w-64 shrink-0">
          <FilterSidebar
            store={store}
            regionFilter={regionFilter}
            categoryFilter={categoryFilter}
            setFilter={setFilter}
            clearAllFilters={clearAllFilters}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold text-foreground">
                {categoryFilter || regionFilter || "All Posters"}
                <span className="text-muted-foreground text-lg ml-2 font-sans font-normal">
                  ({listResponse?.total || 0})
                </span>
              </h1>
              {/* Active filter chips */}
              {activeFilters.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {activeFilters.map(f => (
                    <Badge
                      key={f.key}
                      variant="secondary"
                      className="flex items-center gap-1 cursor-pointer hover:bg-secondary/80 pr-1.5"
                      onClick={() => setFilter(f.key, undefined)}
                      data-testid={`filter-chip-${f.key}`}
                    >
                      {f.label}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Mobile filter button */}
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="md:hidden gap-2" data-testid="btn-mobile-filters">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                    {activeFilters.length > 0 && (
                      <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-4 h-4 text-xs flex items-center justify-center">
                        {activeFilters.length}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 pt-8 overflow-y-auto">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="font-serif text-xl">Filters</SheetTitle>
                  </SheetHeader>
                  <FilterSidebar
                    store={store}
                    regionFilter={regionFilter}
                    categoryFilter={categoryFilter}
                    setFilter={setFilter}
                    clearAllFilters={clearAllFilters}
                  />
                  <div className="mt-8">
                    <Button className="w-full" onClick={() => setMobileFiltersOpen(false)} data-testid="btn-show-results">
                      Show results ({listResponse?.total || 0})
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

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
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-[190px] sm:aspect-[3/4] sm:h-auto bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : listResponse?.posters.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 rounded-lg" data-testid="shop-empty-state">
              <h2 className="font-serif text-2xl font-bold text-foreground mb-2">No posters found</h2>
              <p className="text-muted-foreground mb-6 text-sm">
                Try clearing filters or browsing all posters.
              </p>
              <Button onClick={clearAllFilters} data-testid="btn-clear-filters">
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
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
