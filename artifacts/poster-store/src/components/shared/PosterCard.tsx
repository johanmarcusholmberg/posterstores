import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Poster } from "@workspace/api-client-react";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { addFavorite, removeFavorite } from "@/lib/favoritesApi";
import { getPosterMockups, resolvePosterDisplayImage, type PosterMockup } from "@/lib/mockupApi";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoginPromptModal } from "./LoginPromptModal";

interface PosterCardProps {
  poster: Poster;
  favoritedIds?: number[];
}

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
  const symbol = symbols[currency] ?? currency;
  if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
  return `${symbol}${price.toFixed(2)}`;
}

export const PosterCard = ({ poster, favoritedIds }: PosterCardProps) => {
  const store = useStorefront();
  const { user } = useAuth();
  const { toast } = useToast();
  const [displayImage, setDisplayImage] = useState<string>(poster.imageUrl);
  const [isFavorite, setIsFavorite] = useState(() =>
    favoritedIds ? favoritedIds.includes(poster.id) : false
  );
  const [showPrompt, setShowPrompt] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (favoritedIds !== undefined) {
      setIsFavorite(favoritedIds.includes(poster.id));
    }
  }, [favoritedIds, poster.id]);

  useEffect(() => {
    let cancelled = false;
    getPosterMockups(poster.id, store.storeKey)
      .then((mockups: PosterMockup[]) => {
        if (!cancelled) {
          setDisplayImage(resolvePosterDisplayImage(mockups, poster.imageUrl));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [poster.id, poster.imageUrl, store.storeKey]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      setShowPrompt(true);
      return;
    }

    if (isPending) return;
    setIsPending(true);
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
      setIsPending(false);
    }
  };

  const activeSizes = (poster as any).posterSizes?.filter((s: any) => s.active) ?? [];
  const lowestPrice = (poster as any).lowestActivePrice;
  const displayPrice = lowestPrice != null ? lowestPrice : poster.price;
  const displayCurrency = activeSizes[0]?.currency ?? poster.currency;
  const priceLabel = activeSizes.length > 1
    ? `From ${formatPrice(displayPrice, displayCurrency)}`
    : formatPrice(displayPrice, displayCurrency);

  const href = (poster as any).slug ? `/posters/${(poster as any).slug}` : `/poster/${poster.id}`;

  return (
    <>
      <Link href={href} className="group block" data-testid={`link-poster-${poster.id}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-muted rounded-md mb-4 shadow-sm group-hover:shadow-md transition-shadow">
          <img
            src={displayImage}
            alt={poster.title}
            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            data-testid={`img-poster-${poster.id}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = poster.imageUrl;
            }}
          />
          {poster.isNew && (
            <div className="absolute top-2 left-2 bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded">
              NEW
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 bg-white/50 backdrop-blur hover:bg-white/80 rounded-full"
            onClick={toggleFavorite}
            disabled={isPending}
            aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
            data-testid={`btn-favorite-${poster.id}`}
          >
            <Heart
              className={`h-4 w-4 ${isFavorite ? "fill-secondary text-secondary" : "text-foreground"}`}
            />
          </Button>
        </div>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-serif font-semibold text-lg text-foreground line-clamp-1">{poster.title}</h3>
            <p className="text-sm text-muted-foreground">{poster.city || poster.region}</p>
          </div>
          <p className="font-medium text-foreground text-sm whitespace-nowrap ml-2">
            {priceLabel}
          </p>
        </div>
      </Link>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
};
