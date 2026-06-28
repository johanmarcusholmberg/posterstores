/**
 * PosterArtworkStage
 *
 * Renders poster artwork with ratio-aware fitting and a thin border that hugs
 * the actual artwork — not the card container. Used by PosterCard (shop grid).
 *
 * Ratio source: actual image naturalWidth / naturalHeight read on <img> onLoad.
 * Print-size labels are NOT used — they describe available product sizes, not
 * the artwork orientation. A landscape photo can carry portrait print sizes.
 *
 * Fitting rules:
 *   The outer card container is fixed (e.g. aspect-[3/4]).
 *   Before the image loads: inner wrapper fills the card, object-contain on img.
 *   After load: wrapper sized to actual image ratio, centered in the fixed card.
 *     Portrait (ratio < 1): fill card height, auto width, max-width 100%.
 *     Landscape/square (ratio ≥ 1): fill card width, auto height, max-height 100%.
 *   The thin border lives on the inner wrapper, hugging the actual artwork.
 *   Artwork image uses object-contain — nothing is ever cropped.
 *
 * Hover crossfade:
 *   Both base and hover layers are always in the DOM so the hover image pre-loads.
 *   600 ms symmetrical fade. The hover mockup fills the full card with object-cover
 *   (lifestyle/mockup images where cover is appropriate).
 */

import React, { useState } from "react";
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
   * @deprecated No longer used. Natural image dimensions are read from onLoad.
   * Kept so existing callers don't break.
   */
  aspectRatio?: number | null;
  /** @deprecated Ignored. Kept so existing callers don't break. */
  presentation?: PosterCardPresentation;
  "data-testid"?: string;
  onError?: React.ImgHTMLAttributes<HTMLImageElement>["onError"];
  /** Called once when the base image loads, with its natural width/height ratio. */
  onRatioLoad?: (ratio: number) => void;
}

/**
 * Returns orientation-aware CSS for the inner artwork wrapper.
 *
 * Before load (null): fills the card container so object-contain img is visible.
 * Portrait (< 1):  height 100%, auto width — fills card vertically, centers horizontally.
 * Landscape/sq (≥ 1): width 100%, auto height — fills card horizontally, centers vertically.
 */
function artworkWrapperStyle(ratio: number | null): React.CSSProperties {
  if (ratio === null) {
    return { position: "absolute", inset: 0 };
  }
  if (ratio < 1) {
    return {
      position: "relative",
      aspectRatio: String(ratio),
      height: "100%",
      width: "auto",
      maxWidth: "100%",
    };
  }
  return {
    position: "relative",
    aspectRatio: String(ratio),
    width: "100%",
    height: "auto",
    maxHeight: "100%",
  };
}

export function PosterArtworkStage({
  src,
  hoverSrc,
  alt,
  priority = false,
  "data-testid": testId,
  onError,
  onRatioLoad,
}: PosterArtworkStageProps) {
  const hasHover = hoverSrc !== null;
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const r = img.naturalWidth / img.naturalHeight;
      setNaturalRatio(r);
      onRatioLoad?.(r);
    }
  }

  const wrapperStyle = artworkWrapperStyle(naturalRatio);
  const hasRatio = naturalRatio !== null;

  // ── Base artwork layer ────────────────────────────────────────────────────
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
          hasRatio && "ring-1 ring-inset ring-black/[0.14]",
          "motion-reduce:transition-none"
        )}
        style={wrapperStyle}
      >
        <img
          src={getOptimizedImageUrl(src, { width: 600, quality: 85 })}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain"
          data-testid={testId}
          onLoad={handleLoad}
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
        "opacity-0",
        "group-hover:opacity-100",
        "group-focus-within:opacity-100"
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
