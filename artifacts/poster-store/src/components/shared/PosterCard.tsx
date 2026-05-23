import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Poster } from "@workspace/api-client-react";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { addFavorite, removeFavorite } from "@/lib/favoritesApi";
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

  const mainImage = poster.primaryDisplayImageUrl ?? poster.imageUrl;
  const hoverImage = poster.hoverDisplayImageUrl ?? null;

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
  const priceLabel =
    activeSizes.length > 1
      ? `From ${formatPrice(displayPrice, displayCurrency)}`
      : formatPrice(displayPrice, displayCurrency);

  const slug = (poster as any).slug as string | undefined;
  const href = slug ? `/posters/${slug}` : `/poster/${poster.id}`;

  return (
    <>
      <Link
        href={href}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-testid={`link-poster-${poster.id}`}
      >
        {/* Image container — flat, gallery-style. No rounded corners, minimal shadow. */}
        <div
          className={[
            "relative h-[190px] sm:h-auto sm:aspect-[3/4] overflow-hidden",
            "bg-[#f4f0eb]",
            "mb-2 sm:mb-3",
            "shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
            "transition-shadow duration-300 ease-out",
            "group-hover:shadow-[0_2px_12px_rgba(0,0,0,0.10)]",
          ].join(" ")}
        >
          {/*
            Main poster image.
            • When a hover mockup exists: fades out and drifts very slightly on hover/focus.
            • When no hover mockup: subtle scale + brightness lift as a fallback premium feel.
            • motion-reduce: all transitions collapse to none — no animation at all.
          */}
          <img
            src={mainImage}
            alt={poster.title}
            className={[
              "absolute inset-0 object-cover w-full h-full",
              "transition-[opacity,transform,filter] duration-[400ms] ease-out",
              "motion-reduce:transition-none",
              hoverImage
                ? // Has mockup: fade + slight drift out on hover
                  "opacity-100 scale-100 group-hover:opacity-0 group-hover:scale-[1.02] group-focus-within:opacity-0 group-focus-within:scale-[1.02]"
                : // No mockup: subtle zoom + brightness lift
                  "opacity-100 scale-100 group-hover:scale-[1.03] group-hover:brightness-[1.04] group-focus-within:scale-[1.03] group-focus-within:brightness-[1.04]",
            ].join(" ")}
            data-testid={`img-poster-${poster.id}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = poster.imageUrl;
            }}
          />

          {/*
            Hover mockup image — crossfades in on hover/focus, only rendered when available.
            Starts slightly pre-zoomed (scale-[1.03]) and zooms back to natural size as it fades
            in, giving a smooth morph feel without a jarring swap.
            aria-hidden: always decorative — screen readers use the main image alt text.
            motion-reduce: transition collapses to none (opacity stays 0 so it never shows).
          */}
          {hoverImage && (
            <img
              src={hoverImage}
              alt=""
              aria-hidden="true"
              className={[
                "absolute inset-0 object-cover w-full h-full",
                "transition-[opacity,transform] duration-[400ms] ease-out",
                "motion-reduce:transition-none",
                "opacity-0 scale-[1.03]",
                "group-hover:opacity-100 group-hover:scale-100",
                "group-focus-within:opacity-100 group-focus-within:scale-100",
              ].join(" ")}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}

          {/* Subtle inset edge — gives the image a "print edge" depth cue */}
          <div
            className="absolute inset-0 ring-1 ring-inset ring-black/[0.06] pointer-events-none"
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

        {/* Info area — category · title · price only */}
        <div className="mt-0.5">
          {poster.category && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-0.5 truncate">
              {poster.category}
            </p>
          )}
          <h3 className="font-serif font-semibold text-base sm:text-lg text-foreground line-clamp-2 leading-snug">
            {poster.title}
          </h3>
          <p className="font-medium text-foreground text-sm mt-1">{priceLabel}</p>
        </div>
      </Link>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
};
