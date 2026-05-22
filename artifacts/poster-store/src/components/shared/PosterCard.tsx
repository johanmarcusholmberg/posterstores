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
    if (poster.primaryDisplayImageUrl) {
      setDisplayImage(poster.primaryDisplayImageUrl);
      return;
    }

    let cancelled = false;
    getPosterMockups(poster.id, store.storeKey)
      .then((mockups: PosterMockup[]) => {
        if (!cancelled) {
          const activeMockups = mockups.filter((m) => {
            if (!m.mockupTemplateId) return !!m.mockupImageUrl;
            if (m.template && m.template.active === false) return false;
            return !!(m.mockupImageUrl || m.template?.previewThumbnailUrl || m.template?.backgroundImageUrl);
          });
          setDisplayImage(resolvePosterDisplayImage(activeMockups, poster.imageUrl));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [poster.id, poster.imageUrl, store.storeKey, poster.primaryDisplayImageUrl]);

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

  const activeSizes = poster.posterSizes?.filter((s) => s.active) ?? [];
  const lowestPrice = poster.lowestActivePrice;
  const displayPrice = lowestPrice != null ? lowestPrice : poster.price;
  const displayCurrency = activeSizes[0]?.currency ?? poster.currency;
  const priceLabel = activeSizes.length > 1
    ? `From ${formatPrice(displayPrice, displayCurrency)}`
    : formatPrice(displayPrice, displayCurrency);

  const sizeNames: string[] = activeSizes
    .map((s) => s.sizeLabel)
    .filter((n) => n.length > 0);
  const sizeLabel = sizeNames.length > 0 ? sizeNames.join(" · ") : null;

  const href = (poster as any).slug ? `/posters/${(poster as any).slug}` : `/poster/${poster.id}`;

  return (
    <>
      <Link
        href={href}
        className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-testid={`link-poster-${poster.id}`}
      >
        {/*
          Image container — styled to evoke a physical print:
          warm paper background, restrained corners, layered print shadow,
          subtle lift on hover.
        */}
        <div
          className={[
            "relative h-[190px] sm:h-auto sm:aspect-[3/4] overflow-hidden",
            "bg-[#f4f0eb]",
            "rounded-sm",
            "mb-2 sm:mb-3",
            "shadow-[0_1px_3px_rgba(0,0,0,0.07),0_2px_10px_rgba(0,0,0,0.05)]",
            "group-hover:shadow-[0_4px_18px_rgba(0,0,0,0.11),0_1px_4px_rgba(0,0,0,0.07)]",
            "group-hover:-translate-y-px",
            "transition-[box-shadow,transform] duration-300 ease-out",
          ].join(" ")}
        >
          <img
            src={displayImage}
            alt={poster.title}
            className="object-cover w-full h-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            data-testid={`img-poster-${poster.id}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = poster.imageUrl;
            }}
          />

          {/* Subtle inset ring — gives the image a "print edge" depth cue */}
          <div
            className="absolute inset-0 ring-1 ring-inset ring-black/[0.07] rounded-sm pointer-events-none"
            aria-hidden="true"
          />

          {poster.isNew && (
            <div className="absolute top-2 left-2 bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded">
              NEW
            </div>
          )}

          {/* Hover CTA — desktop only */}
          <div
            className="absolute inset-x-0 bottom-0 hidden sm:flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none"
            aria-hidden="true"
          >
            <span className="bg-background/90 backdrop-blur-sm text-foreground text-xs font-medium px-4 py-1.5 rounded-full shadow-sm border border-border/40 tracking-wide">
              View poster
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 bg-white/50 backdrop-blur hover:bg-white/80 rounded-full transition-colors"
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

        {/* Info area — Title → Location → Sizes/Material → Price */}
        <div className="mt-0.5">
          {poster.category && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-0.5 truncate">
              {poster.category}
            </p>
          )}
          <h3 className="font-serif font-semibold text-base sm:text-lg text-foreground line-clamp-2 leading-snug">
            {poster.title}
          </h3>
          {(poster.city || poster.region) && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {poster.city || poster.region}
            </p>
          )}
          <div className="mt-1">
            {sizeLabel && (
              <p className="text-xs text-muted-foreground/70 tracking-wide leading-snug">{sizeLabel}</p>
            )}
            <p className="text-[10px] text-muted-foreground/50 tracking-wide mt-0.5">
              Premium matte print
            </p>
          </div>
          <p className="font-medium text-foreground text-sm mt-1.5">
            {priceLabel}
          </p>
        </div>
      </Link>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
};
