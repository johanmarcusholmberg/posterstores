import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { useListPosters, getListPostersQueryKey, Poster } from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { CollectionBannerSection } from "@/components/shared/CollectionBannerSection";
import { type CollectionBannerVisualConfig } from "@/config/storefronts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";
import { SlidersHorizontal, X, Check, Loader2 } from "lucide-react";

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
  const shopCfg = store.shop;

  const regionLabel = shopCfg?.regionFilterLabel ?? "Region";
  const allRegionsLabel = shopCfg?.allRegionsLabel ?? "All Regions";
  const categoryLabel = shopCfg?.categoryFilterLabel ?? "Categories";
  const allCategoriesLabel = shopCfg?.allCategoriesLabel ?? "All Categories";

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-serif font-bold text-lg mb-4">{regionLabel}</h3>
        <div className="space-y-0.5">
          <button
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              regionFilters.length === 0
                ? "text-primary font-semibold"
                : "hover:bg-muted/60 text-foreground/70"
            }`}
            onClick={() => clearSection("region")}
          >
            {allRegionsLabel}
          </button>
          {store.regions.map(region => (
            <button
              key={region}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-2 ${
                regionFilters.includes(region)
                  ? "text-primary font-semibold"
                  : "hover:bg-muted/60 text-foreground/70"
              }`}
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
          <h3 className="font-serif font-bold text-lg mb-4">{categoryLabel}</h3>
          <div className="space-y-0.5">
            <button
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                categoryFilters.length === 0
                  ? "text-primary font-semibold"
                  : "hover:bg-muted/60 text-foreground/70"
              }`}
              onClick={() => clearSection("category")}
            >
              {allCategoriesLabel}
            </button>
            {store.categories.map(category => (
              <button
                key={category}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center justify-between gap-2 ${
                  categoryFilters.includes(category)
                    ? "text-primary font-semibold"
                    : "hover:bg-muted/60 text-foreground/70"
                }`}
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



function HiddenFiltersPopover({
  hiddenFilters,
  onRemove,
}: {
  hiddenFilters: { label: string; key: string; value: string }[];
  onRemove: (f: { label: string; key: string; value: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  // Close when tapping outside (touch devices)
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative z-40 shrink-0"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      data-testid="filter-chips-overflow"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          inline-flex h-6 shrink-0 items-center
          whitespace-nowrap rounded-full
          border border-border/70
          bg-muted/50 px-2.5 py-0
          text-[11px] font-medium leading-none
          text-muted-foreground
          transition-colors
          hover:border-border
          hover:bg-muted
          hover:text-foreground
        "
      >
        +{hiddenFilters.length} more
      </button>

      {open && (
        <div
          className="
            absolute left-0 top-full z-50 mt-1.5
            min-w-[170px]
            rounded-lg border border-border
            bg-background p-2 shadow-lg
            flex flex-col gap-1
          "
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {hiddenFilters.map(f => (
            <button
              key={`${f.key}-${f.value}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(f);
              }}
              className="flex items-center justify-between gap-3 text-xs text-foreground hover:bg-muted/60 rounded px-2.5 py-1.5 text-left w-full transition-colors group min-h-[36px]"
            >
              <span>{f.label}</span>
              <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0" />
            </button>
          ))}
        </div>
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

  const [page, setPage] = useState(0);
  const [accumulated, setAccumulated] = useState<Poster[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);

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

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(0);
  }, [filterSig]);

  const setFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchString);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    setLocation(`/shop?${params.toString()}`);
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
  };

  const clearSection = (key: string) => {
    const params = new URLSearchParams(searchString);
    params.delete(key);
    setLocation(`/shop?${params.toString()}`);
  };

  const clearAllFilters = () => {
    setLocation("/shop");
    setMobileFiltersOpen(false);
  };

  const activeFilters: { label: string; key: string; value: string }[] = [];
  regionFilters.forEach(r => activeFilters.push({ label: r, key: "region", value: r }));
  categoryFilters.forEach(c => activeFilters.push({ label: c, key: "category", value: c }));
  if (tagFilter) activeFilters.push({ label: tagFilter, key: "tag", value: tagFilter });
  if (searchQuery) activeFilters.push({ label: `"${searchQuery}"`, key: "search", value: searchQuery });

  const hasAnyFilter = activeFilters.length > 0;
  const total = grandTotal || pageData?.total || 0;

  const hasMore = accumulated.length < grandTotal;
  const isLoadingFirstPage = isLoading || (isFetching && page === 0 && accumulated.length === 0);
  const isLoadingMore = isFetching && page > 0;

  const CHIP_LIMIT = 2;
  const visibleChips = activeFilters.slice(0, CHIP_LIMIT);
  const hiddenCount = activeFilters.length - CHIP_LIMIT;

  const shopCfg = store.shop;
  const { resolvedRoutePrefix } = store;

  const shopBanners = useMemo((): CollectionBannerVisualConfig[] => {
    const banners = (store.homepageVisualConfig as any)?.collectionBanners ?? [];
    return (banners as CollectionBannerVisualConfig[])
      .filter(b => b.showInShop === true && b.visible !== false)
      .sort((a, b) => (a.shopInsertAfter ?? 0) - (b.shopInsertAfter ?? 0));
  }, [store.homepageVisualConfig]);

  type GridSegment = { posters: Poster[]; banner: CollectionBannerVisualConfig | null };
  const gridSegments = useMemo((): GridSegment[] => {
    if (hasAnyFilter || shopBanners.length === 0) {
      return [{ posters: accumulated, banner: null }];
    }
    const segments: GridSegment[] = [];
    let start = 0;
    for (const banner of shopBanners) {
      const insertAfter = banner.shopInsertAfter ?? 0;
      if (insertAfter <= start) continue;
      // Skip banners beyond the known total poster count (would never be reached)
      if (grandTotal > 0 && insertAfter > grandTotal) break;
      // Pin the banner at its configured slot, clamped to however many posters have
      // loaded so far. When not enough posters are loaded yet, the banner appears at
      // the end of the current list and gently moves toward its final position as more
      // posters fill in — preventing the jarring jump that would occur if the banner
      // were hidden entirely and then suddenly inserted mid-grid on the next page load.
      const sliceEnd = Math.min(insertAfter, accumulated.length);
      segments.push({ posters: accumulated.slice(start, sliceEnd), banner });
      start = sliceEnd;
      // If accumulated hasn't reached this banner's position yet, stop here —
      // no posters to place after it yet.
      if (accumulated.length <= insertAfter) break;
    }
    // Remaining posters after all injected banners
    segments.push({ posters: accumulated.slice(start), banner: null });
    return segments;
  }, [accumulated, grandTotal, shopBanners, hasAnyFilter]);

  const gridClasses = "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6";

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
          <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-baseline gap-x-2 font-serif text-3xl font-bold text-foreground">
                <span>
                  {hasAnyFilter ? "Showing" : "All Posters"}
                </span>

                <span className="font-sans text-2xl font-normal text-primary/70">
                  {total} poster{total !== 1 ? "s" : ""}
                </span>
              </h1>

              {/*
                Fixed second row:
                - without filters: show the shop tagline
                - with filters: show the active filter controls
              */}
                <div className="relative mt-1.5 flex min-h-6 max-w-full items-center overflow-visible">
                {hasAnyFilter ? (
                    <div
                      className="
                        flex min-w-0 items-center gap-2
                        overflow-visible
                      "
                    >
                    {visibleChips.map((f) => (
                      <Badge
                        key={`${f.key}-${f.value}`}
                        variant="secondary"
                        className="
                          inline-flex h-6 shrink-0 items-center gap-1
                          whitespace-nowrap rounded-md
                          px-2.5 py-0
                          text-[11px] font-semibold leading-none
                          cursor-pointer
                          hover:bg-secondary/80
                        "
                        onClick={() => {
                          if (
                            f.key === "region" ||
                            f.key === "category"
                          ) {
                            toggleFilter(f.key, f.value);
                          } else {
                            setFilter(f.key, undefined);
                          }
                        }}
                        data-testid={`filter-chip-${f.key}-${f.value}`}
                      >
                        {f.label}
                        <X className="h-3 w-3 shrink-0" />
                      </Badge>
                    ))}

                    {hiddenCount > 0 && (
                      <HiddenFiltersPopover
                        hiddenFilters={activeFilters.slice(CHIP_LIMIT)}
                        onRemove={(f) => {
                          if (
                            f.key === "region" ||
                            f.key === "category"
                          ) {
                            toggleFilter(f.key, f.value);
                          } else {
                            setFilter(f.key, undefined);
                          }
                        }}
                      />
                    )}

                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="
                        inline-flex h-6 shrink-0 items-center
                        whitespace-nowrap px-1 py-0
                        text-[11px] font-medium leading-none
                        text-muted-foreground
                        transition-colors
                        hover:text-foreground hover:underline
                        underline-offset-2
                      "
                      data-testid="btn-clear-all-filters"
                    >
                      Clear all
                    </button>
                  </div>
                ) : (
                  <p className="truncate text-xs tracking-wide text-muted-foreground/70">
                    {shopCfg?.shopTagline ?? ""}
                  </p>
                )}
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center shrink-0 self-start">
              {/* Mobile filter button */}
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="
                        md:hidden
                        h-11 min-h-[44px]
                        w-full sm:w-auto
                        min-w-0
                        justify-center gap-2
                        rounded-md px-3
                        text-sm"
                      data-testid="btn-mobile-filters"
                      >
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
                      Show results ({total})
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortFilter} onValueChange={(v) => setFilter("sort", v)}>
                <SelectTrigger
                  className="
                    h-11 min-h-[44px]
                    w-full min-w-0
                    rounded-md px-3
                    text-sm
                    sm:w-[180px]
                  "
                >
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
            <div className={gridClasses}>
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
              {gridSegments.map((segment, segIdx) => (
                <React.Fragment key={segIdx}>
                  {segment.posters.length > 0 && (
                    <div className={cn(gridClasses, segIdx > 0 && "mt-3")}>
                      {segment.posters.map((poster, i) => (
                        <PosterCard
                          key={poster.id}
                          poster={poster}
                          priority={segIdx === 0 && i < 2}
                          returnTo={`/shop${searchString ? `?${searchString}` : ""}`}
                        />
                      ))}
                    </div>
                  )}
                  {segment.banner && (
                    <div className="my-4">
                      <CollectionBannerSection
                        banner={segment.banner}
                        staticBanner={store.shop?.collectionBanner ?? null}
                        collectionPreviewPosters={[]}
                        resolvedRoutePrefix={resolvedRoutePrefix}
                        displayStyleOverride={segment.banner.shopDisplayStyle}
                        mobileModeOverride={segment.banner.shopMobileMode}
                        embedded
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </>
          )}

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
        </main>
      </div>
    </div>
  );
}
