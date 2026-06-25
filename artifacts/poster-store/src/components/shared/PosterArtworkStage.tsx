/**
 * PosterArtworkStage
 *
 * Renders poster artwork with ratio-aware fitting and a thin border that hugs
 * the actual artwork — not the card container. Used by PosterCard (shop grid).
 *
 * Fitting rules (derived from parsed size-label aspect ratio):
 *   The outer card container is fixed (e.g. aspect-[3/4]).
 *   The inner wrapper is sized to the poster's natural parsed ratio and centered.
 *   The artwork image uses object-contain inside the inner wrapper.
 *   Because the wrapper matches the poster ratio, artwork fills it naturally
 *   without any cropping. If the source image differs slightly from the label
 *   ratio, tiny gaps appear inside the wrapper rather than cutting the artwork.
 *   The thin border lives on the inner wrapper, hugging the actual artwork.
 *   When the ratio is unknown/null, a portrait-safe 3/4 inner wrapper is used.
 *
 * Hover crossfade:
 *   Both base and hover layers are always in the DOM so the hover image pre-loads.
 *   600 ms symmetrical fade. The hover mockup fills the full card with object-cover
 *   (lifestyle/mockup images where cover is appropriate).
 *
 * The legacy `presentation` prop is accepted but ignored — rendering no
 * longer depends on it. The PosterCardPresentation type is kept exported
 * so callers that still reference it do not need immediate updates.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/imageUrl";

/** @deprecated Rendering no longer uses presentation modes. Kept for type compat. */
export type PosterCardPresentation = "current" | "full-image" | "stage";

interface PosterArtworkStageProps {
  src: string;
  hoverSrc: string | null;
  alt: string;
  priority?: boolean;
  /**
   * Poster aspect ratio (width / height) parsed from size labels.
   * Drives the inner wrapper size so artwork fits without cropping.
   * Pass null when unknown — a portrait-safe 3/4 fallback wrapper is used.
   */
  aspectRatio?: number | null;
  /** @deprecated Ignored. Kept so existing callers don't break. */
  presentation?: PosterCardPresentation;
  "data-testid"?: string;
  onError?: React.ImgHTMLAttributes<HTMLImageElement>["onError"];
}

export function PosterArtworkStage({
  src,
  hoverSrc,
  alt,
  priority = false,
  aspectRatio = null,
  "data-testid": testId,
  onError,
}: PosterArtworkStageProps) {
  const hasHover = hoverSrc !== null;

  // ── Base artwork layer ────────────────────────────────────────────────────
  // Outer flex centers the inner ratio-wrapper in the fixed card container.
  // Inner wrapper is sized to the poster's natural ratio — border hugs artwork.
  // Artwork image uses object-contain: nothing is ever cropped.
  // Unknown ratio falls back to a 3/4 portrait-safe wrapper.

  const baseArtwork = (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center",
        "motion-reduce:transition-none",
        hasHover
          ? "transition-opacity duration-[600ms] ease-out opacity-100 group-hover:opacity-0 group-focus-within:opacity-0"
          : ""
      )}
    >
      <div
        className={cn(
          "relative ring-1 ring-inset ring-black/[0.14]",
          "motion-reduce:transition-none",
          !hasHover &&
            "transition-transform duration-[300ms] ease-out scale-100 group-hover:scale-[1.08] group-focus-within:scale-[1.08]"
        )}
        style={{
          aspectRatio: aspectRatio ? String(aspectRatio) : "3/4",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
        <img
          src={getOptimizedImageUrl(src, { width: 600, quality: 85 })}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain"
          data-testid={testId}
          onError={onError}
        />
      </div>
    </div>
  );

  // ── Hover mockup overlay ──────────────────────────────────────────────────
  // Fills the full card stage with object-cover — lifestyle/mockup images are
  // intended to fill the frame. This is the only place object-cover is used.
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
