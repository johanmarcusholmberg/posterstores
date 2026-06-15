import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { getSessionId } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MockupGallery } from "@/components/public/MockupGallery";
import { PosterCard } from "@/components/shared/PosterCard";
import { LoginPromptModal } from "@/components/shared/LoginPromptModal";
import { ShoppingBag, ArrowLeft, Heart, ChevronDown, ChevronUp, Shield, Truck, Package, Sparkles } from "lucide-react";
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
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="pb-4 text-sm text-muted-foreground space-y-1 leading-relaxed">
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

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/shop");
    }
  };

  const [poster, setPoster] = useState<PosterData | null | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null);
  const [mockups, setMockups] = useState<PosterMockup[] | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoritesPending, setFavoritesPending] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

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

  const { data: relatedPosters } = useListPosters(
    { storeKey: store.storeKey, region: poster?.region ?? undefined, limit: 4 },
    {
      query: {
        enabled: !!poster?.region,
        queryKey: getListPostersQueryKey({ storeKey: store.storeKey, region: poster?.region ?? undefined, limit: 4 }),
      },
    }
  );

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
      <div className="container mx-auto px-4 py-6 md:py-12 animate-pulse">
        <div className="h-5 bg-muted w-24 rounded mb-4 md:mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-10">
          <div className="aspect-[3/4] w-full bg-muted rounded-md" />
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

  return (
    <div className="container mx-auto px-4 py-6 md:py-12">
      <button onClick={goBack} className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4 md:mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to shop
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-10 mb-12 md:mb-24 items-start">
        <div>
          <MockupGallery
            mockups={mockups ?? []}
            fallbackImageUrl={poster.imageUrl}
            alt={poster.title}
            isLoading={mockups === null}
          />
        </div>

        <div className="flex flex-col">
          <div className="mb-2 text-muted-foreground text-sm font-medium tracking-wider uppercase">
            {poster.region} {poster.city && `• ${poster.city}`}
          </div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-3">
            {poster.title}
          </h1>
          <p className="text-2xl font-medium text-foreground mb-4 md:mb-8" data-testid="detail-price">
            {pricePrefix}{formatPrice(displayedPrice, displayedCurrency)}
          </p>

          <div className="prose prose-stone mb-6 md:mb-10 text-muted-foreground">
            <p>{poster.description}</p>
          </div>

          {activeSizes.length > 0 && (
            <div className="mb-6 md:mb-10">
              <h3 className="font-medium text-foreground mb-3">Select Size</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="size-selector">
                {activeSizes.map((size) => {
                  const isSelected = selectedSizeId === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setSelectedSizeId(size.id)}
                      data-testid={`size-option-${size.id}`}
                      className={`flex flex-col items-start rounded-md border-2 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-primary/50 hover:bg-accent/50"
                      }`}
                    >
                      <span className="font-medium text-sm text-foreground">{size.sizeLabel}</span>
                      <span className={`text-sm mt-1 font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {formatPrice(size.price, size.currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {noActiveSizes && (
            <p className="text-sm text-muted-foreground italic mb-8 border border-border rounded-md px-4 py-3 bg-muted/30">
              This poster is not currently available for purchase.
            </p>
          )}

          <div className="flex gap-3 mt-auto">
            <Button
              size="lg"
              className="flex-1 text-lg h-14"
              onClick={handleAddToCart}
              disabled={addCartItem.isPending || noActiveSizes || (activeSizes.length > 0 && !selectedSizeId)}
              data-testid="btn-add-to-cart"
            >
              {addCartItem.isPending ? "Adding..." : (
                <><ShoppingBag className="mr-2 h-5 w-5" /> Add to cart</>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-4"
              onClick={handleToggleFavorite}
              disabled={favoritesPending}
              aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart className={`h-5 w-5 ${isFavorite ? "fill-secondary text-secondary" : ""}`} />
            </Button>
          </div>

          {poster.tags && poster.tags.length > 0 && (
            <div className="mt-12 flex flex-wrap gap-2">
              {poster.tags.map(tag => (
                <Link key={tag} href={`/shop?tag=${encodeURIComponent(tag)}`}>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
                    {tag}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {relatedPosters && relatedPosters.posters.length > 1 && (
        <section className="border-t border-border pt-16">
          <h2 className="font-serif text-3xl font-bold text-foreground mb-8">More from {poster.region}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {relatedPosters.posters
              .filter(p => p.id !== poster.id)
              .slice(0, 4)
              .map(p => (
                <PosterCard key={p.id} poster={p} />
              ))}
          </div>
        </section>
      )}

      <LoginPromptModal open={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </div>
  );
}
