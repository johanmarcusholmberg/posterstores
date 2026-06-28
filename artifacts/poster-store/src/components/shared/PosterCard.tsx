import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Poster } from "@workspace/api-client-react";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { addFavorite, removeFavorite } from "@/lib/favoritesApi";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoginPromptModal } from "./LoginPromptModal";
import { PosterArtworkStage } from "./PosterArtworkStage";

interface PosterCardProps {
  poster: Poster;
  favoritedIds?: number[];
  /** When true, loads the image eagerly with fetchPriority="high" (use for LCP cards only). */
  priority?: boolean;
}

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
  const symbol = symbols[currency] ?? currency;
  if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
  return `${symbol}${price.toFixed(2)}`;
}

export const PosterCard = ({ poster, favoritedIds, priority = false }: PosterCardProps) => {
  const store = useStorefront();
  const { user } = useAuth();
  const { toast } = useToast();

  const baseImage = poster.imageUrl;
  const primaryMockup = poster.primaryDisplayImageUrl ?? null;
  const dedicatedHover = poster.hoverDisplayImageUrl ?? null;
  const hoverImage: string | null =
    dedicatedHover ??
    (primaryMockup && primaryMockup !== baseImage ? primaryMockup : null);

  const [isFavorite, setIsFavorite] = useState(() =>
    favoritedIds ? favoritedIds.includes(poster.id) : false
  );
  const [showPrompt, setShowPrompt] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);

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
        className="group flex flex-col h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-testid={`link-poster-${poster.id}`}
      >
        <div className={[
          "flex flex-col flex-1",
          "bg-[#faf8f3] rounded-[2px]",
          "shadow-[0_2px_8px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.06)]",
          "group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.09)]",
          "group-hover:-translate-y-0.5",
          "transition-all duration-300 ease-out",
          "p-2 pb-0",
        ].join(" ")}>
          {/* Image area */}
          <div
            className="relative aspect-[5/7] overflow-hidden"
            style={{ backgroundColor: ratio !== null && ratio > 5 / 7 ? '#faf8f3' : '#ede8e0' }}
          >
            <PosterArtworkStage
              src={baseImage}
              hoverSrc={hoverImage}
              alt={poster.title}
              priority={priority}
              onRatioLoad={setRatio}
              data-testid={`img-poster-${poster.id}`}
              onError={(e) => {
                (e.target as HTMLImageElement).src = poster.imageUrl;
              }}
            />

            {/* Hover label — desktop only */}
            <div
              className="absolute inset-x-0 bottom-0 hidden sm:flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none"
              aria-hidden="true"
            >
              <span className="bg-background/85 backdrop-blur-sm text-foreground text-xs font-medium px-4 py-1.5 rounded-full shadow-sm border border-border/40 tracking-wide">
                View poster
              </span>
            </div>
          </div>

          {/* Info area */}
          <div className="px-0.5 pt-2.5 pb-3 min-h-[52px] flex flex-col justify-start min-w-0">
            {poster.category && (
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-0.5 truncate">
                {poster.category}
              </p>
            )}
            <h3 className="font-serif font-semibold text-[13px] sm:text-xs text-foreground/85 truncate leading-snug">
              {(poster as any).displayTitle || poster.title}
            </h3>
            <div className="flex items-center justify-between mt-1 gap-1">
              <p className="text-[11px] text-foreground/50">{priceLabel}</p>
              <div className="flex items-center gap-1 shrink-0">
                {poster.isNew && (
                  <div className="rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-transparent text-[10px] font-medium tracking-[0.12em] uppercase px-2 py-[2px] whitespace-nowrap">
                    NEW
                  </div>
                )}
                <button
                  type="button"
                  onClick={toggleFavorite}
                  disabled={isPending}
                  aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                  data-testid={`btn-favorite-${poster.id}`}
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-[#ede8e0] active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a08a] disabled:opacity-50"
                >
                  <Heart
                    className={`h-3.5 w-3.5 transition-colors duration-150 ${isFavorite ? "fill-[#8f5f45] text-[#8f5f45]" : "text-[#8f5f45]/60"}`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Link>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
};
