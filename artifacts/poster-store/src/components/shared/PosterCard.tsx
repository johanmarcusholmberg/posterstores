import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Poster } from "@workspace/api-client-react";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { addFavorite, removeFavorite } from "@/lib/favoritesApi";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoginPromptModal } from "./LoginPromptModal";
import { PosterArtworkStage, type PosterCardPresentation } from "./PosterArtworkStage";

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
        3. null — no hover image; use the scale fallback instead

    Public cards may only use rendered mockupImageUrl, never template background
    images. This rule is enforced server-side in posterEnrichment.ts:
    primaryDisplayImageUrl and hoverDisplayImageUrl are null unless a generated
    mockupImageUrl exists, the template is active, status ≠ failed, and (for
    AI-rendered mockups) approvedForPublic = true.
  */
  const baseImage = poster.imageUrl;

  const primaryMockup = poster.primaryDisplayImageUrl ?? null;
  const dedicatedHover = poster.hoverDisplayImageUrl ?? null;

  // Prefer the dedicated hover mockup; fall back to the primary mockup if it
  // differs from the raw poster image (crossfade from art → room context).
  // Both are guaranteed to be rendered mockupImageUrl values or null.
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

  // Presentation mode: read from store config, default to "current" (original behaviour).
  const presentation: PosterCardPresentation = (store.posterCardPresentation as PosterCardPresentation | null | undefined) ?? "current";

  return (
    <>
      <Link
        href={href}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-testid={`link-poster-${poster.id}`}
      >
        {/* Image container */}
        <div
          className={[
            "relative aspect-[3/4] overflow-hidden",
            "bg-[#f4f0eb]",
            "mb-2 sm:mb-3",
            "shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
            "transition-shadow duration-300 ease-out",
            "group-hover:shadow-[0_3px_16px_rgba(0,0,0,0.12)]",
          ].join(" ")}
        >
          {/*
            PosterArtworkStage renders:
              — The base artwork layer (mode-aware: contain / cover / centred-stage)
              — The hover mockup overlay (always in DOM when hoverImage exists, so it
                pre-loads; fades in/out symmetrically at 600 ms on hover-in AND hover-out)
          */}
          <PosterArtworkStage
            src={baseImage}
            hoverSrc={hoverImage}
            alt={poster.title}
            priority={priority}
            presentation={presentation}
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

          {/*
            Overlay row — heart (left) + NEW badge (right).
            items-center aligns both overlays by their visual centers
            regardless of their respective heights, with no pixel hacks.
            Wrapper is pointer-events-none; button re-enables events.
          */}
          <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between pointer-events-none">
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={isPending}
              aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
              data-testid={`btn-favorite-${poster.id}`}
              className="pointer-events-auto h-9 w-9 flex items-center justify-center rounded-full bg-[#fefcfa]/85 border border-[#c9a08a]/70 shadow-sm backdrop-blur-[2px] hover:bg-[#fefcfa] hover:border-[#c9a08a] active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a08a] disabled:opacity-50"
            >
              <Heart
                className={`h-4 w-4 transition-colors duration-150 ${isFavorite ? "fill-[#8f5f45] text-[#8f5f45]" : "text-[#8f5f45]/75"}`}
              />
            </button>

            {poster.isNew && (
              <div className="rounded-full border border-[#c9a08a]/70 text-[#9e6b4e] bg-[#fefcfa]/80 backdrop-blur-[2px] text-[10px] font-medium tracking-[0.12em] uppercase px-2.5 py-[3px]">
                NEW
              </div>
            )}
          </div>

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
        <div className="mt-0.5">
          {poster.category && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-0.5 truncate">
              {poster.category}
            </p>
          )}
          <h3 className="font-serif font-semibold text-base sm:text-lg text-foreground truncate leading-snug">
            {(poster as any).displayTitle || poster.title}
          </h3>
          <p className="font-medium text-foreground text-sm mt-1">{priceLabel}</p>
        </div>
      </Link>
      <LoginPromptModal open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
};
