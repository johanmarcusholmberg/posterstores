import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetPoster, getGetPosterQueryKey, useListPosters, getListPostersQueryKey, useAddCartItem, getGetCartQueryKey } from "@workspace/api-client-react";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { getSessionId } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PosterCard } from "@/components/shared/PosterCard";
import { MockupGallery } from "@/components/public/MockupGallery";
import { LoginPromptModal } from "@/components/shared/LoginPromptModal";
import { ShoppingBag, ArrowLeft, Heart, ChevronDown, ChevronUp, Shield, Truck, Package, Sparkles, Star } from "lucide-react";
import { getPosterMockups, type PosterMockup } from "@/lib/mockupApi";
import { addFavorite, removeFavorite, getFavoriteIds } from "@/lib/favoritesApi";

interface PosterSizeOption {
  id: number;
  sizeLabel: string;
  price: number;
  currency: string;
  active: boolean;
  sortOrder: number;
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

export default function PosterDetail() {
  const { id } = useParams();
  const posterId = Number(id);
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

  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null);
  const [mockups, setMockups] = useState<PosterMockup[] | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoritesPending, setFavoritesPending] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const { data: poster, isLoading } = useGetPoster(
    posterId,
    { storeKey: store.storeKey },
    {
      query: {
        enabled: !!posterId && !isNaN(posterId),
        queryKey: getGetPosterQueryKey(posterId, { storeKey: store.storeKey }),
      },
    }
  );

  const activeSizes: PosterSizeOption[] = ((poster as any)?.posterSizes ?? []).filter((s: PosterSizeOption) => s.active);

  useEffect(() => {
    if (activeSizes.length === 1 && selectedSizeId == null) {
      setSelectedSizeId(activeSizes[0].id);
    }
  }, [activeSizes.length, selectedSizeId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [posterId]);

  useEffect(() => {
    if (!posterId || isNaN(posterId)) return;
    getPosterMockups(posterId, store.storeKey)
      .then(setMockups)
      .catch(() => setMockups([]));
  }, [posterId, store.storeKey]);

  useEffect(() => {
    if (!user || !posterId || isNaN(posterId)) return;
    getFavoriteIds(store.storeKey)
      .then((ids) => setIsFavorite(ids.includes(posterId)))
      .catch(() => {});
  }, [user, posterId, store.storeKey]);

  const { data: relatedPosters } = useListPosters(
    { storeKey: store.storeKey, region: poster?.region, limit: 4 },
    {
      query: {
        enabled: !!poster?.region,
        queryKey: getListPostersQueryKey({ storeKey: store.storeKey, region: poster?.region, limit: 4 }),
      },
    }
  );

  const addCartItem = useAddCartItem();
  const selectedSize = activeSizes.find(s => s.id === selectedSizeId) ?? null;

  const displayedPrice = selectedSize
    ? selectedSize.price
    : ((poster as any)?.lowestActivePrice ?? poster?.price ?? 0);
  const displayedCurrency = selectedSize?.currency ?? poster?.currency ?? "EUR";
  const pricePrefix = !selectedSize && activeSizes.length > 1 ? "From " : "";

  const handleAddToCart = () => {
    if (!poster) return;
    if (activeSizes.length === 0) {
      toast({ variant: "destructive", title: "Not available", description: "This poster is not currently available for purchase." });
      return;
    }
    if (activeSizes.length > 0 && !selectedSizeId) {
      toast({ variant: "destructive", title: "Select a size", description: "Please choose a size before adding to cart." });
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
            description: `${poster.title}${selectedSize ? ` — ${selectedSize.sizeLabel}` : ""} is in your cart.`,
          });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Could not add to cart", description: "Please try again." });
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
        toast({ title: "Saved", description: "Added to your saved posters." });
      } else {
        await removeFavorite(poster.id, store.storeKey);
        toast({ title: "Removed", description: "Removed from your saved posters." });
      }
    } catch {
      setIsFavorite(!next);
      toast({ variant: "destructive", title: "Could not save poster", description: "Please try again." });
    } finally {
      setFavoritesPending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex gap-12 animate-pulse">
        <div className="w-1/2 aspect-[3/4] bg-muted rounded-md" />
        <div className="w-1/2 space-y-6">
          <div className="h-10 bg-muted w-3/4 rounded" />
          <div className="h-6 bg-muted w-1/4 rounded" />
          <div className="h-32 bg-muted w-full rounded" />
        </div>
      </div>
    );
  }

  if (!poster) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-serif mb-4">Poster not found</h1>
        <Button variant="outline" onClick={goBack}>Back to shop</Button>
      </div>
    );
  }

  const noActiveSizes = activeSizes.length === 0;

  return (
    <div className="container mx-auto px-4 py-12">
      <button onClick={goBack} className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to shop
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-10 mb-24 items-start">
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
          <p className="text-2xl font-medium text-foreground mb-8" data-testid="detail-price">
            {pricePrefix}{formatPrice(displayedPrice, displayedCurrency)}
          </p>

          <div className="prose prose-stone mb-10 text-muted-foreground">
            <p>{poster.description}</p>
          </div>

          {activeSizes.length > 0 && (
            <div className="mb-10">
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
              aria-label={isFavorite ? "Remove from wishlist" : "Save to wishlist"}
            >
              <Heart className={`h-5 w-5 ${isFavorite ? "fill-secondary text-secondary" : ""}`} />
            </Button>
          </div>

          {/* Trust block */}
          <div className="mt-8 rounded-lg border border-border bg-muted/20 px-4 py-4" data-testid="trust-block">
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 shrink-0 text-primary/70" />
                Printed on demand — each poster is made fresh for your order
              </li>
              <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 shrink-0 text-primary/70" />
                Secure payment with Stripe — we never store your card details
              </li>
              <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Package className="h-4 w-4 shrink-0 text-primary/70" />
                Carefully packed and protected for shipping
              </li>
              <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Truck className="h-4 w-4 shrink-0 text-primary/70" />
                High-resolution print file prepared for professional production
              </li>
            </ul>
          </div>

          {/* Collapsible info sections */}
          <div className="mt-6 border border-border rounded-lg divide-y divide-border overflow-hidden" data-testid="poster-info-sections">
            <CollapsibleSection title="Print details">
              <p>All posters are produced at professional print studios using archival-quality paper and inks.</p>
              <p className="mt-2">Files are prepared at full resolution and reviewed before production to ensure the best possible result.</p>
            </CollapsibleSection>
            <CollapsibleSection title="Shipping & delivery">
              <p>Shipping options and delivery estimates are shown at checkout based on your location.</p>
              <p className="mt-2">Orders are typically dispatched within 2–5 business days after payment confirmation.</p>
              <p className="mt-2">
                <Link href="/shipping" className="text-primary hover:underline">Full shipping information →</Link>
              </p>
            </CollapsibleSection>
            <CollapsibleSection title="Returns & damaged items">
              <p>We accept returns within 14 days for items that arrive damaged or with a production defect.</p>
              <p className="mt-2">Please photograph the issue and contact us — we'll arrange a reprint or refund promptly.</p>
              <p className="mt-2">
                <Link href="/returns" className="text-primary hover:underline">Returns policy →</Link>
              </p>
            </CollapsibleSection>
          </div>

          {poster.tags && poster.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
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
