import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useLocation, useSearch } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { getSessionId } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MockupGallery } from "@/components/public/MockupGallery";
import { PosterCard } from "@/components/shared/PosterCard";
import { LoginPromptModal } from "@/components/shared/LoginPromptModal";
import { ShoppingBag, ArrowLeft, Heart, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Shield, Truck, Package, Sparkles } from "lucide-react";
import { getPosterMockups, type PosterMockup } from "@/lib/mockupApi";
import { useAddCartItem, getGetCartQueryKey, useListPosters, getListPostersQueryKey } from "@workspace/api-client-react";
import { addFavorite, removeFavorite, getFavoriteIds } from "@/lib/favoritesApi";

interface PosterSizeOption {
  id: number;
  sizeLabel: string;
  price: number;
  currency: string;
  active: boolean;
  sortOrder: number;
}

interface PosterData {
  id: number;
  storeKey: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  imageUrl: string;
  region?: string | null;
  city?: string | null;
  category: string;
  tags?: string[] | null;
  price: number;
  currency: string;
  isFeatured?: boolean | null;
  isNew?: boolean | null;
  status?: string;
  createdAt: string;
  posterSizes?: PosterSizeOption[];
  lowestActivePrice?: number | null;
}

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
  const symbol = symbols[currency] ?? currency;
  if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
  return `${symbol}${price.toFixed(2)}`;
}

const DEFAULT_TRUST_MESSAGES = [
  {
    key: "paper",
    icon: Package,
    title: "Premium matte paper",
    detail: "High-quality art print",
  },
  {
    key: "delivery",
    icon: Truck,
    title: "Printed to order",
    detail: "Dispatch in 2–4 working days",
  },
  {
    key: "payment",
    icon: Shield,
    title: "Secure payment",
    detail: "30-day returns",
  },
] as const;

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex items-center justify-between w-full py-4 text-sm font-medium text-foreground hover:text-primary transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground/50" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
      </button>
      {open && (
        <div className="pb-4 text-sm text-foreground/65 space-y-1 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

async function fetchPosterBySlug(storeKey: string, slug: string): Promise<PosterData | null> {
  const res = await fetch(`/api/posters/by-slug/${encodeURIComponent(slug)}?storeKey=${encodeURIComponent(storeKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load poster");
  return res.json();
}

export default function PosterBySlug() {
  const { slug } = useParams<{ slug: string }>();
  const store = useStorefront();
  const { user } = useAuth();
  const sessionId = getSessionId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const rawReturnTo = new URLSearchParams(search).get("returnTo");
  const isSafeReturnTo = (url: string | null): url is string =>
    !!url && url.startsWith("/") && !url.startsWith("//");
  const returnTo = isSafeReturnTo(rawReturnTo) ? rawReturnTo : null;

  const goBack = () => {
    setLocation(returnTo ?? "/shop");
  };

  const [poster, setPoster] = useState<PosterData | null | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null);
  const [mockups, setMockups] = useState<PosterMockup[] | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoritesPending, setFavoritesPending] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const addToCartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    setPoster(undefined);
    setNotFound(false);
    fetchPosterBySlug(store.storeKey, slug)
      .then(data => {
        if (data === null) setNotFound(true);
        else setPoster(data);
      })
      .catch(() => setNotFound(true));
  }, [slug, store.storeKey]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [slug]);

  useEffect(() => {
    if (!poster) return;
    document.title = `${poster.title} | ${store.storeName ?? store.storeKey}`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && poster.description) {
      metaDesc.setAttribute("content", poster.description);
    }
    return () => {
      document.title = store.storeName ?? store.storeKey;
    };
  }, [poster, store]);

  const activeSizes: PosterSizeOption[] = (poster?.posterSizes ?? []).filter(s => s.active);

  useEffect(() => {
    if (activeSizes.length === 1 && selectedSizeId == null) {
      setSelectedSizeId(activeSizes[0].id);
    }
  }, [activeSizes.length, selectedSizeId]);

  useEffect(() => {
    if (!poster) return;
    getPosterMockups(poster.id, store.storeKey)
      .then(setMockups)
      .catch(() => setMockups([]));
  }, [poster?.id, store.storeKey]);

  useEffect(() => {
    if (!user || !poster) return;
    getFavoriteIds(store.storeKey)
      .then((ids) => setIsFavorite(ids.includes(poster.id)))
      .catch(() => {});
  }, [user, poster?.id, store.storeKey]);

  useEffect(() => {
    const el = addToCartRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowStickyBar(false);
        } else {
          // Only show when the button has scrolled above the viewport,
          // not when it is still below (initial page load).
          setShowStickyBar(entry.boundingClientRect.top < 0);
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [poster]);

  const { data: relatedPosters } = useListPosters(
    { storeKey: store.storeKey, region: poster?.region ?? undefined, limit: 12 },
    {
      query: {
        enabled: !!poster?.region,
        queryKey: getListPostersQueryKey({ storeKey: store.storeKey, region: poster?.region ?? undefined, limit: 12 }),
      },
    }
  );

  const relatedTrackRef = useRef<HTMLDivElement>(null);
  const [relatedCanScrollLeft, setRelatedCanScrollLeft] = useState(false);
  const [relatedCanScrollRight, setRelatedCanScrollRight] = useState(false);

  const updateRelatedScrollState = useCallback(() => {
    const el = relatedTrackRef.current;
    if (!el) return;
    setRelatedCanScrollLeft(el.scrollLeft > 4);
    setRelatedCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollRelated = useCallback((dir: "left" | "right") => {
    const el = relatedTrackRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir === "right" ? amount : -amount, behavior: "smooth" });
  }, []);

  const relatedList = (relatedPosters?.posters ?? []).filter(p => p.id !== poster?.id);

  useEffect(() => {
    updateRelatedScrollState();
  }, [relatedList.length, updateRelatedScrollState]);

  useEffect(() => {
    window.addEventListener("resize", updateRelatedScrollState);
    return () => window.removeEventListener("resize", updateRelatedScrollState);
  }, [updateRelatedScrollState]);

  const addCartItem = useAddCartItem();
  const selectedSize = activeSizes.find(s => s.id === selectedSizeId) ?? null;

  const displayedPrice = selectedSize
    ? selectedSize.price
    : (poster?.lowestActivePrice ?? poster?.price ?? 0);
  const displayedCurrency = selectedSize?.currency ?? poster?.currency ?? "EUR";
  const pricePrefix = !selectedSize && activeSizes.length > 1 ? "From " : "";

  const handleAddToCart = () => {
    if (!poster) return;
    if (activeSizes.length === 0) {
      toast({ variant: "destructive", title: "This poster is not currently available for purchase." });
      return;
    }
    if (activeSizes.length > 0 && !selectedSizeId) {
      toast({ variant: "destructive", title: "Please select a size" });
      return;
    }
    addCartItem.mutate(
      {
        data: {
          sessionId,
          storeKey: store.storeKey,
          posterId: poster.id,
          quantity: 1,
          posterSizeId: selectedSizeId ?? undefined,
          size: selectedSize?.sizeLabel ?? undefined,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId, storeKey: store.storeKey }) });
          toast({
            title: "Added to cart",
            description: `${poster.title}${selectedSize ? ` — ${selectedSize.sizeLabel}` : ""} has been added to your cart.`,
          });
        },
      }
    );
  };

  const handleToggleFavorite = async () => {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }
    if (favoritesPending || !poster) return;
    setFavoritesPending(true);
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      if (next) {
        await addFavorite(poster.id, store.storeKey);
        toast({ title: "Added to saved posters" });
      } else {
        await removeFavorite(poster.id, store.storeKey);
      }
    } catch {
      setIsFavorite(!next);
      toast({ variant: "destructive", title: "Could not save poster. Please try again." });
    } finally {
      setFavoritesPending(false);
    }
  };

  if (poster === undefined && !notFound) {
    return (
      <div className="container mx-auto w-full max-w-[1280px] px-4 py-6 md:py-12 animate-pulse">
        <div className="h-5 bg-muted w-24 rounded mb-4 md:mb-8" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] lg:gap-12 xl:gap-14">
          <div className="aspect-[5/7] w-full max-w-[520px] rounded-sm bg-muted" />
          <div className="space-y-6">
            <div className="h-10 bg-muted w-3/4 rounded" />
            <div className="h-6 bg-muted w-1/4 rounded" />
            <div className="h-32 bg-muted w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !poster) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-serif mb-4">Poster not found</h1>
        <Button variant="outline" onClick={goBack}>Back to shop</Button>
      </div>
    );
  }

  const noActiveSizes = activeSizes.length === 0;

  let backLabel = "Explore all posters";

  if (returnTo) {
    backLabel = "Back to your Selection";

    const returnToRegion = new URLSearchParams(returnTo.split("?")[1] ?? "").get("region");

    const selectedRegions = returnToRegion
      ? returnToRegion
          .split(",")
          .map((region) => region.trim())
          .filter(Boolean)
      : [];

    if (selectedRegions.length === 1) {
      backLabel = `Back to ${selectedRegions[0]} posters`;
    }
  }

  return (
    <div className="container mx-auto w-full max-w-[1280px] px-4 pt-6 md:py-12 pb-28 md:pb-12">
      <button onClick={goBack} className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4 md:mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] gap-8 lg:gap-12 xl:gap-14 mb-10 md:mb-14 items-start">
        <div>
          <MockupGallery
            mockups={mockups ?? []}
            fallbackImageUrl={poster.imageUrl}
            alt={poster.title}
            isLoading={mockups === null}
          />
        </div>

        <div className="flex flex-col w-full max-w-[560px]">
          {poster.region && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
              {poster.region}
            </p>
          )}
          <h1 className="font-serif text-4xl md:text-5xl font-bold leading-[1.05] text-foreground">
            {poster.title}
          </h1>
          {poster.description && (
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-foreground/65">
              {poster.description}
            </p>
          )}
          <div className="mt-5">
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {pricePrefix}
              {formatPrice(displayedPrice, displayedCurrency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Includes VAT · Frame not included
            </p>
          </div>

          {activeSizes.length > 0 && (
            <div className="mt-7 mb-5 md:mb-8">
              <h3 className="font-medium text-foreground mb-3">Select size</h3>

              {/* 
                Mobile: horizontal scroll row
                Tablet/Desktop: compact grid
              */}
              <div className="-mx-4 px-4 overflow-x-auto pb-2 sm:mx-0 sm:px-0 sm:overflow-visible sm:pb-0">
                <div
                  className="
                    flex gap-2 snap-x snap-mandatory
                    sm:grid sm:grid-cols-3 sm:gap-3 sm:snap-none
                    lg:grid-cols-5
                  "
                  data-testid="size-selector"
                >
                  {activeSizes.map((size) => {
                    const isSelected = selectedSizeId === size.id;

                    return (
                      <button
                        key={size.id}
                        type="button"
                        onClick={() => setSelectedSizeId(size.id)}
                        data-testid={`size-option-${size.id}`}
                        aria-pressed={isSelected}
                        className={`
                          relative shrink-0 w-[118px] sm:w-auto snap-start
                          flex flex-col items-start justify-center
                          rounded-lg border px-3 pr-8 py-2.5 text-left
                          min-h-[60px]
                          transition-all cursor-pointer
                          ${
                            isSelected
                              ? "border-primary bg-primary/[0.07] shadow-[0_2px_8px_rgba(0,0,0,0.06)] ring-1 ring-primary/30"
                              : "border-border/80 bg-background hover:border-primary/40 hover:bg-accent/30"
                          }
                        `}
                      >

                        {isSelected && (
                          <span
                            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-background"
                            aria-hidden="true"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                        
                        <span
                          className={`text-sm leading-tight ${
                            isSelected
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/80"
                          }`}
                        >
                          {size.sizeLabel}
                        </span>

                        <span
                          className={`text-sm mt-0.5 font-semibold leading-tight ${
                            isSelected ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {formatPrice(size.price, size.currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {noActiveSizes && (
            <p className="text-sm text-muted-foreground italic mb-8 border border-border rounded-md px-4 py-3 bg-muted/30">
              This poster is not currently available for purchase.
            </p>
          )}

          <div
            ref={addToCartRef}
            className="flex max-w-[560px] gap-3 mt-auto"
          >
            <Button
              size="lg"
              className="
                h-[52px] flex-1 rounded-[5px]
                bg-foreground text-background
                text-[15px] font-semibold
                shadow-none
                transition-colors
                hover:bg-foreground/90
                focus-visible:ring-2
                focus-visible:ring-foreground/30
                focus-visible:ring-offset-2
                disabled:bg-primary
                disabled:text-primary-foreground
                disabled:opacity-50
              "
              onClick={handleAddToCart}
              disabled={
                addCartItem.isPending ||
                noActiveSizes ||
                (activeSizes.length > 0 && !selectedSizeId)
              }
              data-testid="btn-add-to-cart"
            >
              {addCartItem.isPending ? (
                "Adding…"
              ) : (
                <>
                  <ShoppingBag className="mr-2 h-5 w-5" />
                  Add to cart
                </>
              )}
            </Button>

            <Button
              size="lg"
              variant="outline"
              className={`
                h-[52px] w-[52px] shrink-0 rounded-[5px] px-0
                border shadow-none transition-colors
                hover:border-foreground/30 hover:bg-muted/50
                ${
                  isFavorite
                    ? "border-secondary/50 bg-secondary/5"
                    : "border-border bg-background"
                }
              `}
              onClick={handleToggleFavorite}
              disabled={favoritesPending}
              aria-label={
                isFavorite
                  ? "Remove from wishlist"
                  : "Add to wishlist"
              }
            >
              <Heart
                className={`h-5 w-5 transition-colors ${
                  isFavorite
                    ? "fill-secondary text-secondary"
                    : "text-foreground/70"
                }`}
              />
            </Button>
          </div>

          <div
            className="mt-5 max-w-[560px] py-4"
            aria-label="Shopping benefits"
          >
            <div className="grid grid-cols-3">
              {DEFAULT_TRUST_MESSAGES.map(
                ({ key, icon: Icon, title, detail }) => (
                  <div
                    key={key}
                    className="
                      flex min-w-0 flex-col items-center
                      px-2 text-center
                      sm:items-start sm:px-4 sm:text-left
                    "
                  >
                    <Icon
                      className="mb-2 h-4 w-4 shrink-0 text-primary"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />

                    <p className="text-xs font-semibold leading-4 text-foreground">
                      {title}
                    </p>

                    <p className="mt-0.5 text-[11px] leading-4 text-foreground/60">
                      {detail}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          <div
            className="mt-4 max-w-[560px] border-t border-border"
            aria-label="Product information"
          >
            <CollapsibleSection title="Product details">
              <p>
                Museum-quality poster printed on premium matte paper.
              </p>
              <p>
                Frame is not included.
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="Paper & printing">
              <p>
                Printed using high-quality inks for rich colours and sharp details.
              </p>
              <p>
                Each poster is produced to order.
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="Shipping & returns">
              <p>
                Orders are normally dispatched within 2–4 working days.
              </p>
              <p>
                Returns are accepted within 30 days.
              </p>
            </CollapsibleSection>
          </div>
          
          {poster.tags && poster.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {poster.tags.map(tag => (
                <Link key={tag} href={`/shop?tag=${encodeURIComponent(tag)}`}>
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer">
                    {tag}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {relatedList.length > 0 && (
        <section className="border-t border-border pt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-3xl font-bold text-foreground">More from {poster.region}</h2>
            <Link
              href={`/shop?region=${encodeURIComponent(poster.region ?? "")}`}
              className="text-sm text-primary font-medium hover:underline shrink-0 ml-4"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="relative -mx-4 px-4">
            <div
              ref={relatedTrackRef}
              className="flex gap-4 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={updateRelatedScrollState}
            >
              {relatedList.map(p => (
                <div
                  key={p.id}
                  className="flex-none snap-start w-[170px] sm:w-[200px] lg:w-[220px]"
                >
                  <PosterCard poster={p} returnTo={returnTo ?? undefined} />
                </div>
              ))}
            </div>
            {relatedCanScrollLeft && (
              <button
                onClick={() => scrollRelated("left")}
                aria-label="Scroll related posters left"
                className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-8 h-8 rounded-full bg-background/95 border border-border shadow-md text-foreground/80 hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {relatedCanScrollRight && (
              <button
                onClick={() => scrollRelated("right")}
                aria-label="Scroll related posters right"
                className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-8 h-8 rounded-full bg-background/95 border border-border shadow-md text-foreground/80 hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      )}

      <LoginPromptModal open={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />

      {/* Sticky mobile Add to Cart bar — hidden on md+ */}
      <div
        aria-hidden={!showStickyBar}
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-50
          bg-background border-t border-border shadow-lg
          px-4 pt-3 pb-3
          transition-transform transition-opacity duration-200 ease-out
          ${showStickyBar ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}
        `}
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">
              {poster.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedSize
                ? `${selectedSize.sizeLabel} · ${formatPrice(selectedSize.price, selectedSize.currency)}`
                : `${pricePrefix}${formatPrice(displayedPrice, displayedCurrency)}`}
            </p>
          </div>
          <Button
            size="default"
            className="
              h-11 shrink-0 rounded-[5px] px-5
              bg-foreground text-background
              text-sm font-semibold
              shadow-none transition-colors
              hover:bg-foreground/90
              disabled:bg-primary
              disabled:text-primary-foreground
              disabled:opacity-50
            "
            onClick={handleAddToCart}
            disabled={
              addCartItem.isPending ||
              noActiveSizes ||
              (activeSizes.length > 0 && !selectedSizeId)
            }
            aria-label="Add to cart"
          >
            {addCartItem.isPending ? (
              "Adding…"
            ) : (
              <>
                <ShoppingBag className="mr-1.5 h-4 w-4" />
                Add to cart
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
