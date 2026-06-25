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

  /*
    Image strategy:
    - baseImage: always the raw poster artwork (imageUrl). This is what the
      customer sees before hovering — clean, flat, product-first.
    - hoverImage: resolved with priority:
        1. hoverDisplayImageUrl — a dedicated lifestyle/room mockup
        2. primaryDisplayImageUrl — the primary assigned mockup, if it's
           different from imageUrl (i.e. a mockup has been assigned at all)
        3. null — no hover image; card shadow handles hover feedback

    Public cards may only use rendered mockupImageUrl, never template background
    images. This rule is enforced server-side in posterEnrichment.ts.
  */
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

  // Card background — store-level override or warm neutral fallback
  const cardBg = (store as any).productCardBgColor || "#f4f0eb";

  return (
    <>
      <Link
        href={href}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-testid={`link-poster-${poster.id}`}
      >
        {/* Image/stage container — shadow increase only on hover, no lift or scale */}
        <div
          className={[
            "relative aspect-[3/4] overflow-hidden",
            "mb-2 sm:mb-3",
            "shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
            "transition-shadow duration-300 ease-out",
            "group-hover:shadow-[0_3px_14px_rgba(0,0,0,0.10)]",
          ].join(" ")}
          style={{ backgroundColor: cardBg }}
        >
          <PosterArtworkStage
            src={baseImage}
            hoverSrc={hoverImage}
            alt={poster.title}
            priority={priority}
            data-testid={`img-poster-${poster.id}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = poster.imageUrl;
            }}
          />

          {/* Subtle inset edge — print edge depth cue */}
          <div
            className="absolute inset-0 ring-1 ring-inset ring-black/[0.06] pointer-events-none"
            aria-hidden="true"
          />
        </div>

        {/*
          Info area — NEW badge and heart sit below the image so the artwork
          stays clean. The layout never shifts between posters with/without NEW
          because the badge is inline with the price row.
        */}
        <div className="mt-0.5">
          <div className="flex items-start gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              {poster.category && (
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-0.5 truncate">
                  {poster.category}
                </p>
              )}
              <h3 className="font-serif font-semibold text-base sm:text-lg text-foreground truncate leading-snug">
                {(poster as any).displayTitle || poster.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="font-medium text-foreground text-sm">{priceLabel}</p>
                {poster.isNew && (
                  <span className="rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-[#fefcfa] text-[10px] font-medium tracking-[0.12em] uppercase px-2.5 py-[2px] shrink-0">
                    NEW
                  </span>
                )}
              </div>
            </div>

            {/* Heart/favorite button — right of info area, easy tap target */}
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={isPending}
              aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
              data-testid={`btn-favorite-${poster.id}`}
              className="mt-0.5 h-8 w-8 flex-none flex items-center justify-center rounded-full bg-[#fefcfa] border border-[#c9a08a]/60 shadow-sm hover:bg-[#fef9f6] hover:border-[#c9a08a] active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a08a] disabled:opacity-50"
            >
              <Heart
                className={`h-3.5 w-3.5 transition-colors duration-150 ${isFavorite ? "fill-[#8f5f45] text-[#8f5f45]" : "text-[#8f5f45]/75"}`}
              />
            </button>
          </div>
        </div>
      </Link>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
};
