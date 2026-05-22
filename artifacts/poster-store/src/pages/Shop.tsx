import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import { useListPosters, getListPostersQueryKey, Poster } from "@workspace/api-client-react";
import { PosterCard } from "@/components/shared/PosterCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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

function ShopEditorialIntro({
  title,
  subtitle,
  trustNotes,
  trustLine,
}: {
  title?: string;
  subtitle?: string;
  trustNotes?: string[];
  trustLine?: string;
}) {
  if (!title && !subtitle) return null;
  return (
    <div className="mb-8 pb-7 border-b border-border/60">
      {title && (
        <h2 className="font-serif text-xl sm:text-2xl font-bold text-foreground leading-snug mb-2">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
          {subtitle}
        </p>
      )}
      {trustNotes && trustNotes.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {trustNotes.map(note => (
            <span
              key={note}
              className="inline-flex items-center gap-1.5 text-xs text-foreground/70 bg-muted/60 px-3 py-1 rounded-full border border-border/50"
            >
              <span className="w-1 h-1 rounded-full bg-primary/60 shrink-0" />
              {note}
            </span>
          ))}
        </div>
      )}
      {trustLine && (
        <p className="mt-3 text-xs text-muted-foreground/80 tracking-wide">{trustLine}</p>
      )}
    </div>
  );
}

function CollectionBanner({
  title,
  text,
  ctaText,
  onCtaClick,
}: {
  title: string;
  text: string;
  ctaText?: string;
  onCtaClick?: () => void;
}) {
  return (
    <div className="col-span-full my-2">
      <div className="rounded-lg bg-secondary/10 border border-secondary/20 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary/80 mb-1">Collection</p>
          <h3 className="font-serif text-lg sm:text-xl font-bold text-foreground leading-snug">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-lg">{text}</p>
        </div>
        {ctaText && (
          <button
            onClick={onCtaClick}
            className="shrink-0 text-sm font-medium text-secondary hover:text-secondary/80 transition-colors underline-offset-2 hover:underline whitespace-nowrap"
          >
            {ctaText} →
          </button>
        )}
      </div>
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

  return (
    <div
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      data-testid="filter-chips-overflow"
    >
      <span className="text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full px-2.5 py-1 font-medium select-none cursor-pointer transition-colors">
        +{hiddenFilters.length} more
      </span>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 bg-background border border-border rounded-lg shadow-lg p-2 flex flex-col gap-1 min-w-[140px]"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {hiddenFilters.map(f => (
            <button
              key={`${f.key}-${f.value}`}
              onClick={() => onRemove(f)}
              className="flex items-center justify-between gap-3 text-xs text-foreground hover:bg-muted/60 rounded px-2.5 py-1.5 text-left w-full transition-colors group"
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
  const collectionBanner = shopCfg?.collectionBanner;
  const BANNER_AFTER = 4;
  const showBanner = !hasAnyFilter && !!collectionBanner && accumulated.length >= BANNER_AFTER;
  const firstBatch = showBanner ? accumulated.slice(0, BANNER_AFTER) : accumulated;
  const restBatch = showBanner ? accumulated.slice(BANNER_AFTER) : [];

  const handleBannerCta = () => {
    if (!collectionBanner) return;
    const params = new URLSearchParams();
    params.set("category", "Coastal Posters");
    setLocation(`/shop?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold text-foreground">
                {hasAnyFilter ? (
                  <>
                    Showing{" "}
                    <span className="text-foreground">{total}</span>{" "}
                    <span className="text-muted-foreground font-sans font-normal text-2xl">
                      poster{total !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  "All Posters"
                )}
              </h1>
              {!hasAnyFilter && total > 0 && (
                <p className="text-sm text-muted-foreground mt-1">{total} posters</p>
              )}

              {/* Compact active filter chips */}
              {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {visibleChips.map(f => (
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
                  {hiddenCount > 0 && (
                    <HiddenFiltersPopover
                      hiddenFilters={activeFilters.slice(CHIP_LIMIT)}
                      onRemove={(f) => {
                        if (f.key === "region" || f.key === "category") {
                          toggleFilter(f.key, f.value);
                        } else {
                          setFilter(f.key, undefined);
                        }
                      }}
                    />
                  )}
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                    data-testid="btn-clear-all-filters"
                  >
                    Clear all
                  </button>
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
                      Show results ({total})
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

          {/* Editorial shop intro — shown only when no filters active */}
          {!hasAnyFilter && shopCfg && (
            <ShopEditorialIntro
              title={shopCfg.introTitle}
              subtitle={shopCfg.introSubtitle}
              trustNotes={shopCfg.introTrustNotes}
              trustLine={shopCfg.trustLine}
            />
          )}

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
          ) : showBanner ? (
            <>
              <div className={gridClasses}>
                {firstBatch.map(poster => (
                  <PosterCard key={poster.id} poster={poster} />
                ))}
              </div>
              <div className="my-6">
                <CollectionBanner
                  title={collectionBanner!.title}
                  text={collectionBanner!.text}
                  ctaText={collectionBanner!.ctaText}
                  onCtaClick={handleBannerCta}
                />
              </div>
              {restBatch.length > 0 && (
                <div className={gridClasses}>
                  {restBatch.map(poster => (
                    <PosterCard key={poster.id} poster={poster} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className={gridClasses}>
              {accumulated.map(poster => (
                <PosterCard key={poster.id} poster={poster} />
              ))}
            </div>
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
