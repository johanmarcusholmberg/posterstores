import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { useListPosters, getListPostersQueryKey, Poster } from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useLocation, useSearch } from "wouter";
import { SlidersHorizontal, X, Check, Search, Loader2 } from "lucide-react";

const PAGE_LIMIT = 24;

function FilterSidebar({
  store,
  regionFilters,
  categoryFilters,
  toggleFilter,
  clearSection,
  clearAllFilters,
}: {
  store: ReturnType<typeof useStorefront>;
  regionFilters: string[];
  categoryFilters: string[];
  toggleFilter: (key: string, value: string) => void;
  clearSection: (key: string) => void;
  clearAllFilters: () => void;
}) {
  const hasFilters = regionFilters.length > 0 || categoryFilters.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-serif font-bold text-lg mb-4">Region</h3>
        <div className="space-y-1">
          <button
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${regionFilters.length === 0 ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
            onClick={() => clearSection("region")}
          >
            All Regions
          </button>
          {store.regions.map(region => (
            <button
              key={region}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-2 ${regionFilters.includes(region) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
              onClick={() => toggleFilter("region", region)}
            >
              <span>{region}</span>
              {regionFilters.includes(region) && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {store.categories && store.categories.length > 0 && (
        <div>
          <h3 className="font-serif font-bold text-lg mb-4">Categories</h3>
          <div className="space-y-1">
            <button
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${categoryFilters.length === 0 ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
              onClick={() => clearSection("category")}
            >
              All Categories
            </button>
            {store.categories.map(category => (
              <button
                key={category}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-2 ${categoryFilters.includes(category) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
                onClick={() => toggleFilter("category", category)}
              >
                <span>{category}</span>
                {categoryFilters.includes(category) && <Check className="h-3.5 w-3.5 shrink-0" />}
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
  const [, setLocation] = useLocation();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const regionFilters = useMemo(
    () => searchParams.get("region")?.split(",").map(v => v.trim()).filter(Boolean) ?? [],
    [searchString]
  );
  const categoryFilters = useMemo(
    () => searchParams.get("category")?.split(",").map(v => v.trim()).filter(Boolean) ?? [],
    [searchString]
  );
  const cityFilter = searchParams.get("city") || undefined;
  const tagFilter = searchParams.get("tag") || undefined;
  const searchQuery = searchParams.get("search") || undefined;
  const sortFilter = (searchParams.get("sort") as any) || "newest";

  // Search input local state with debounce
  const [searchInputValue, setSearchInputValue] = useState(searchQuery ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep input in sync when URL changes externally (e.g. chip removal)
  useEffect(() => {
    setSearchInputValue(searchQuery ?? "");
  }, [searchQuery]);

  // Pagination state
  const [page, setPage] = useState(0);
  const [accumulated, setAccumulated] = useState<Poster[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);

  // Build a filter signature to detect when filters change
  const filterSig = `${store.storeKey}|${regionFilters.join(",")}|${categoryFilters.join(",")}|${cityFilter ?? ""}|${tagFilter ?? ""}|${searchQuery ?? ""}|${sortFilter}`;
  const prevFilterSig = useRef<string | null>(null);

  const offset = page * PAGE_LIMIT;

  const { data: pageData, isLoading, isFetching } = useListPosters(
    {
      storeKey: store.storeKey,
      region: regionFilters.length > 0 ? regionFilters.join(",") : undefined,
      city: cityFilter,
      category: categoryFilters.length > 0 ? categoryFilters.join(",") : undefined,
      tag: tagFilter,
      search: searchQuery,
      sort: sortFilter,
      limit: PAGE_LIMIT,
      offset,
    },
    {
      query: {
        queryKey: getListPostersQueryKey({
          storeKey: store.storeKey,
          region: regionFilters.length > 0 ? regionFilters.join(",") : undefined,
          city: cityFilter,
          category: categoryFilters.length > 0 ? categoryFilters.join(",") : undefined,
          tag: tagFilter,
          search: searchQuery,
          sort: sortFilter,
          limit: PAGE_LIMIT,
          offset,
        }),
      },
    }
  );

  // Accumulate posters; reset when filter signature changes or when cached data
  // is returned unchanged (same reference) after a filter reset.
  useEffect(() => {
    if (!pageData) {
      setAccumulated([]);
      return;
    }
    const isFilterChange = prevFilterSig.current !== null && prevFilterSig.current !== filterSig;
    prevFilterSig.current = filterSig;
    if (page === 0 || isFilterChange) {
      setAccumulated(pageData.posters as Poster[]);
    } else {
      setAccumulated(prev => [...prev, ...(pageData.posters as Poster[])]);
    }
    setGrandTotal(pageData.total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, filterSig]);

  // When the filter signature changes, reset to page 0 only.
  // Do NOT clear accumulated here — the effect above handles repopulation
  // (including the case where TanStack Query returns the same cached reference).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(0);
  }, [filterSig]);

  const handleSearchChange = (value: string) => {
    setSearchInputValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchString);
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      setLocation(`/shop?${params.toString()}`);
    }, 300);
  };

  const clearSearch = () => {
    setSearchInputValue("");
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const params = new URLSearchParams(searchString);
    params.delete("search");
    setLocation(`/shop?${params.toString()}`);
  };

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

  const toggleFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchString);
    const current = params.get(key)?.split(",").map(v => v.trim()).filter(Boolean) ?? [];
    const idx = current.indexOf(value);
    const next = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, value];
    if (next.length === 0) {
      params.delete(key);
    } else {
      params.set(key, next.join(","));
    }
    setLocation(`/shop?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const clearSection = (key: string) => {
    const params = new URLSearchParams(searchString);
    params.delete(key);
    setLocation(`/shop?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const clearAllFilters = () => {
    setLocation("/shop");
    window.scrollTo({ top: 0, behavior: "instant" });
    setMobileFiltersOpen(false);
  };

  const headingLabel = useMemo(() => {
    const parts: string[] = [];
    if (categoryFilters.length === 1) parts.push(categoryFilters[0]);
    else if (categoryFilters.length > 1) parts.push(`${categoryFilters.length} Categories`);
    if (regionFilters.length === 1) parts.push(regionFilters[0]);
    else if (regionFilters.length > 1) parts.push(`${regionFilters.length} Regions`);
    return parts.length > 0 ? parts.join(" · ") : "All Posters";
  }, [categoryFilters, regionFilters]);

  const activeFilters: { label: string; key: string; value: string }[] = [];
  regionFilters.forEach(r => activeFilters.push({ label: r, key: "region", value: r }));
  categoryFilters.forEach(c => activeFilters.push({ label: c, key: "category", value: c }));
  if (tagFilter) activeFilters.push({ label: tagFilter, key: "tag", value: tagFilter });
  if (searchQuery) activeFilters.push({ label: `"${searchQuery}"`, key: "search", value: searchQuery });

  const hasMore = accumulated.length < grandTotal;
  const isLoadingFirstPage = isLoading || (isFetching && page === 0 && accumulated.length === 0);
  const isLoadingMore = isFetching && page > 0;

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden md:block w-64 shrink-0">
          <FilterSidebar
            store={store}
            regionFilters={regionFilters}
            categoryFilters={categoryFilters}
            toggleFilter={toggleFilter}
            clearSection={clearSection}
            clearAllFilters={clearAllFilters}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          {/* Search input */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search posters…"
              value={searchInputValue}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-search"
            />
            {searchInputValue && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
                data-testid="btn-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold text-foreground">
                {headingLabel}
                <span className="text-muted-foreground text-lg ml-2 font-sans font-normal">
                  ({grandTotal || pageData?.total || 0})
                </span>
              </h1>
              {/* Active filter chips */}
              {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {activeFilters.map(f => (
                    <Badge
                      key={`${f.key}-${f.value}`}
                      variant="secondary"
                      className="flex items-center gap-1 cursor-pointer hover:bg-secondary/80 pr-1.5"
                      onClick={() => {
                        if (f.key === "region" || f.key === "category") {
                          toggleFilter(f.key, f.value);
                        } else {
                          setFilter(f.key, undefined);
                        }
                      }}
                      data-testid={`filter-chip-${f.key}-${f.value}`}
                    >
                      {f.label}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {activeFilters.length > 1 && (
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                      data-testid="btn-clear-all-filters"
                    >
                      Clear all
                    </button>
                  )}
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
                    regionFilters={regionFilters}
                    categoryFilters={categoryFilters}
                    toggleFilter={toggleFilter}
                    clearSection={clearSection}
                    clearAllFilters={clearAllFilters}
                  />
                  <div className="mt-8">
                    <Button className="w-full" onClick={() => setMobileFiltersOpen(false)} data-testid="btn-show-results">
                      Show results ({grandTotal || pageData?.total || 0})
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

          {isLoadingFirstPage ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-[190px] sm:aspect-[3/4] sm:h-auto bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : accumulated.length === 0 ? (
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
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                {accumulated.map(poster => (
                  <PosterCard key={poster.id} poster={poster} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-10 flex justify-center">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setPage(p => p + 1)}
                    disabled={isLoadingMore}
                    data-testid="btn-load-more"
                    className="min-w-[160px]"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      `Load more (${grandTotal - accumulated.length} remaining)`
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
