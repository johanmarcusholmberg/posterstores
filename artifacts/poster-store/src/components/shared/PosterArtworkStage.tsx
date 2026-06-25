/**
 * PosterArtworkStage
 *
 * A reusable image stage that renders poster artwork in one of three presentation
 * modes and handles the hover-mockup crossfade. Used by PosterCard and any other
 * grid / carousel that shows product thumbnails.
 *
 * Modes:
 *  "current"    — object-contain on a warm neutral background (original behaviour, default)
 *  "full-image" — object-cover filling the whole card stage
 *  "stage"      — centred artwork with breathing room + drop-shadow on a warm bg;
 *                 good for mixed-ratio collections
 *
 * Hover crossfade:
 *  Both the base artwork layer and the hover-mockup layer are always in the DOM
 *  when a hoverSrc is provided — never conditionally mounted on hover state.
 *  The hover image uses loading="eager" so it's pre-fetched before first hover.
 *  Both layers transition at the same 600 ms duration so the crossfade is
 *  symmetrical on hover-in AND hover-out.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/imageUrl";

export type PosterCardPresentation = "current" | "full-image" | "stage";

interface PosterArtworkStageProps {
  /** Raw poster artwork URL (base layer, always shown before hover). */
  src: string;
  /** Hover mockup URL. When provided both layers are rendered; null = scale-only fallback. */
  hoverSrc: string | null;
  alt: string;
  /** Load the base image eagerly with high fetchPriority (LCP cards only). */
  priority?: boolean;
  /** Visual presentation mode. Defaults to "current". */
  presentation?: PosterCardPresentation;
  /** data-testid forwarded to the base artwork element. */
  "data-testid"?: string;
  /** onError forwarded to the base artwork element. */
  onError?: React.ImgHTMLAttributes<HTMLImageElement>["onError"];
}

export function PosterArtworkStage({
  src,
  hoverSrc,
  alt,
  priority = false,
  presentation = "current",
  "data-testid": testId,
  onError,
}: PosterArtworkStageProps) {
  const hasHover = hoverSrc !== null;

  // ── Base artwork layer ────────────────────────────────────────────────────

  // "stage" mode wraps the artwork in a centred container so we can apply
  // padding + drop-shadow while keeping the real aspect ratio visible.
  const baseArtwork =
    presentation === "stage" ? (
      <div
        className={cn(
          // Leave ~6% breathing room on all sides
          "absolute inset-[6%] flex items-center justify-center",
          "motion-reduce:transition-none",
          hasHover
            ? [
                "transition-opacity duration-[600ms] ease-out",
                "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0",
              ]
            : [
                "transition-transform duration-[300ms] ease-out",
                "scale-100 group-hover:scale-[1.04] group-focus-within:scale-[1.04]",
              ]
        )}
      >
        <img
          src={getOptimizedImageUrl(src, { width: 600, quality: 85 })}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="max-h-full max-w-full object-contain"
          style={{ filter: "drop-shadow(0 3px 18px rgba(0,0,0,0.24))" }}
          data-testid={testId}
          onError={onError}
        />
      </div>
    ) : (
      // "current" or "full-image": fill the container directly
      <img
        src={getOptimizedImageUrl(src, { width: 600, quality: 85 })}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={cn(
          "absolute inset-0 w-full h-full motion-reduce:transition-none",
          presentation === "full-image" ? "object-cover" : "object-contain",
          hasHover
            ? [
                "transition-opacity duration-[600ms] ease-out",
                "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0",
              ]
            : [
                "transition-transform duration-[300ms] ease-out",
                "scale-100 group-hover:scale-[1.08] group-focus-within:scale-[1.08]",
              ]
        )}
        data-testid={testId}
        onError={onError}
      />
    );

  // ── Hover mockup overlay ──────────────────────────────────────────────────
  // Always object-cover and fills the full stage regardless of presentation mode.
  // Always in the DOM (not mounted on hover) so the image is pre-loaded.
  const hoverOverlay = hasHover ? (
    <img
      src={getOptimizedImageUrl(hoverSrc!, { width: 600, quality: 80 })}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
      className={cn(
        "absolute inset-0 object-cover w-full h-full",
        "transition-[opacity,transform] duration-[600ms] ease-out",
        "motion-reduce:transition-none",
        "opacity-0 scale-100",
        "group-hover:opacity-100 group-hover:scale-[1.03]",
        "group-focus-within:opacity-100 group-focus-within:scale-[1.03]"
      )}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  ) : null;

  return (
    <>
      {baseArtwork}
      {hoverOverlay}
    </>
  );
}
