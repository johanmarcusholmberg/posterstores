import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Poster } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { getSessionId } from "@/lib/session";
import { useStorefront } from "@/context/StorefrontContext";
import { useAddFavorite, useRemoveFavorite, useGetFavorites, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getPosterMockups, resolvePosterDisplayImage, type PosterMockup } from "@/lib/mockupApi";

interface PosterCardProps {
  poster: Poster;
}

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
  const symbol = symbols[currency] ?? currency;
  if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
  return `${symbol}${price.toFixed(2)}`;
}

export const PosterCard = ({ poster }: PosterCardProps) => {
  const sessionId = getSessionId();
  const store = useStorefront();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [displayImage, setDisplayImage] = useState<string>(poster.imageUrl);

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

  const favoritesParams = { sessionId, storeKey: store.storeKey };

  const { data: favorites } = useGetFavorites(favoritesParams, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetFavoritesQueryKey(favoritesParams),
    },
  });

  const isFavorite = Array.isArray(favorites) ? favorites.some((p) => p.id === poster.id) : false;

  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isFavorite) {
      removeFavorite.mutate(
        { params: { posterId: poster.id, sessionId, storeKey: store.storeKey } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey(favoritesParams) });
          },
        }
      );
    } else {
      addFavorite.mutate(
        { data: { posterId: poster.id, sessionId, storeKey: store.storeKey } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey(favoritesParams) });
            toast({ title: "Added to favorites" });
          },
        }
      );
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
  );
};
