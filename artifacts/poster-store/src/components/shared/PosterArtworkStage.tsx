/**
 * PosterArtworkStage — Universal poster artwork stage.
 *
 * A fixed-layout stage that renders poster artwork centered on a neutral
 * background, preserving the real aspect ratio of the print. Format-aware
 * max-width / max-height constraints ensure portrait, landscape, and square
 * posters all occupy a similar perceived physical size within the same card.
 *
 * The `presentation` prop is kept for backwards compatibility but is ignored —
 * the universal stage is always used regardless of its value.
 *
 * Hover crossfade:
 *   When hoverSrc is provided both layers are always in the DOM so the mockup
 *   pre-loads before first hover. The base artwork fades out and the mockup
 *   fades in at 600 ms. No zoom or scale is applied to the base artwork —
 *   the card's shadow transition handles hover feedback instead.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/imageUrl";

/** @deprecated Kept for backwards compatibility; the universal stage is always used. */
export type PosterCardPresentation = "current" | "full-image" | "stage";

interface PosterArtworkStageProps {
  /** Raw poster artwork URL (base layer, always shown before hover). */
  src: string;
  /** Hover mockup URL. When provided both layers are rendered; null = no hover swap. */
  hoverSrc: string | null;
  alt: string;
  /** Load the base image eagerly with high fetchPriority (LCP cards only). */
  priority?: boolean;
  /** @deprecated Ignored — the universal stage is always used. */
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
  "data-testid": testId,
  onError,
}: PosterArtworkStageProps) {
  const hasHover = hoverSrc !== null;

  return (
    <>
      {/*
        Base artwork layer — centered with format-aware sizing.

        max-w-[74%] / max-h-[87%] give the right perceived physical size for
        each format inside a 3:4 stage container:
          Portrait  (e.g. 50×70): fills ~74% wide, ~87% tall — nicely dominant.
          Landscape (e.g. 70×50): constrained to 74% wide → ~40% tall — feels
                                  like the same poster rotated, not a bigger one.
          Square    (e.g. 50×50): fills ~74% wide, ~74% tall — balanced.

        The wrapper div handles the crossfade opacity; the img itself has no
        scale transform so the artwork stays still during hover.
      */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center motion-reduce:transition-none",
          hasHover && [
            "transition-opacity duration-[600ms] ease-out",
            "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0",
          ]
        )}
      >
        <img
          src={getOptimizedImageUrl(src, { width: 600, quality: 85 })}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="max-w-[74%] max-h-[87%] w-auto h-auto object-contain"
          style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.18))" }}
          data-testid={testId}
          onError={onError}
        />
      </div>

      {/*
        Hover mockup overlay — always object-cover, fills the full stage.
        Always in the DOM (not mounted on hover) so the image pre-loads
        before the first interaction. Fades in at 600 ms symmetrically.
      */}
      {hasHover && (
        <img
          src={getOptimizedImageUrl(hoverSrc, { width: 600, quality: 80 })}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          className={cn(
            "absolute inset-0 object-cover w-full h-full",
            "transition-opacity duration-[600ms] ease-out motion-reduce:transition-none",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </>
  );
}
