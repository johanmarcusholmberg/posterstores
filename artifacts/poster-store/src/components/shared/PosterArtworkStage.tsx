/**
 * PosterArtworkStage
 *
 * Renders poster artwork with ratio-aware fitting and a thin border that hugs
 * the actual artwork — not the card container. Used by PosterCard (shop grid).
 *
 * Fitting rules (derived from parsed size-label aspect ratio):
 *  - Portrait close to 3:4 card ratio (|ratio - 0.75| < 0.18):
 *      Inner wrapper fills the full card (inset-0). Image: object-cover.
 *      Border is on the wrapper → hugs the artwork edge-to-edge.
 *  - Everything else (landscape, square, extreme portrait, unknown ratio):
 *      Inner wrapper sized to the poster's natural aspect ratio, centered.
 *      Image: object-cover filling that wrapper (no cropping since wrapper
 *      matches the real ratio). Border on wrapper → hugs artwork precisely.
 *
 * Hover crossfade:
 *  Both base and hover layers are always in the DOM (never conditionally
 *  mounted) so the hover image pre-loads. 600 ms symmetrical fade.
 *
 * The legacy `presentation` prop is accepted but ignored — rendering no
 * longer depends on it. The PosterCardPresentation type is kept exported
 * so callers that still reference it do not need immediate updates.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import { posterFillsCard } from "@/lib/posterRatio";

/** @deprecated Rendering no longer uses presentation modes. Kept for type compat. */
export type PosterCardPresentation = "current" | "full-image" | "stage";

interface PosterArtworkStageProps {
  src: string;
  hoverSrc: string | null;
  alt: string;
  priority?: boolean;
  /**
   * Poster aspect ratio (width / height) parsed from size labels.
   * Drives portrait-fill vs natural-ratio-wrapper logic.
   * Pass null when unknown — safe portrait-shaped fallback is used.
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
  const fillsFull = posterFillsCard(aspectRatio);

  // ── Base artwork layer ────────────────────────────────────────────────────

  const baseArtwork = fillsFull ? (
    /*
     * Portrait close to 3:4 — inner wrapper fills the full card.
     * Border on the wrapper hugs the artwork. Fade or scale on hover.
     */
    <div
      className={cn(
        "absolute inset-0",
        "ring-1 ring-inset ring-black/[0.14]",
        "motion-reduce:transition-none",
        hasHover
          ? "transition-opacity duration-[600ms] ease-out opacity-100 group-hover:opacity-0 group-focus-within:opacity-0"
          : "transition-transform duration-[300ms] ease-out scale-100 group-hover:scale-[1.08] group-focus-within:scale-[1.08]"
      )}
    >
      <img
        src={getOptimizedImageUrl(src, { width: 600, quality: 85 })}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
        data-testid={testId}
        onError={onError}
      />
    </div>
  ) : (
    /*
     * Landscape / square / extreme portrait / unknown —
     * outer flex centers the inner ratio-wrapper; border on wrapper.
     */
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
          className="absolute inset-0 w-full h-full object-cover"
          data-testid={testId}
          onError={onError}
        />
      </div>
    </div>
  );

  // ── Hover mockup overlay ──────────────────────────────────────────────────
  // Always fills the full card stage with object-cover regardless of base fitting.
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
