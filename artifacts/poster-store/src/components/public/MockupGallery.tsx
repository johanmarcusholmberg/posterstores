import React, { useState, useEffect, useCallback, useRef } from "react";
import { type PosterMockup, type PosterMockupTemplate } from "@/lib/mockupApi";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface MockupGalleryProps {
  mockups: PosterMockup[];
  fallbackImageUrl: string;
  alt: string;
  isLoading?: boolean;
}

/**
 * Maps a mockup template to a short, customer-friendly label.
 * Does NOT expose internal template names, keys, or admin metadata.
 */
function getFriendlyLabel(m: PosterMockup): string {
  const ft = m.template?.frameType?.toLowerCase() ?? "";
  const cat = m.template?.category?.toLowerCase() ?? "";
  if (ft === "frame" || cat === "frame" || cat === "framed") return "Framed";
  if (ft === "interior" || cat === "interior" || cat === "room") return "Interior";
  if (ft === "wall" || cat === "wall") return "On the wall";
  if (ft === "detail" || cat === "detail" || cat === "close-up") return "Detail";
  if (ft === "lifestyle" || cat === "lifestyle") return "Lifestyle";
  return "Lifestyle";
}

function hasPlacementData(t: PosterMockupTemplate | null): boolean {
  return (
    t != null &&
    t.posterX != null &&
    t.posterY != null &&
    t.posterWidth != null &&
    t.posterHeight != null
  );
}

/**
 * Returns true when a mockup should be shown to customers.
 * Inactive-template rows and orphaned template references are hidden.
 */
function isVisible(m: PosterMockup): boolean {
  if (!m.mockupTemplateId) return !!m.mockupImageUrl;
  if (m.template) return m.template.active !== false;
  return false;
}

interface CompositedMockupProps {
  backgroundUrl: string;
  posterImageUrl: string;
  template: PosterMockupTemplate;
  alt: string;
  className?: string;
}

function buildPosterFilter(t: PosterMockupTemplate): string | undefined {
  const brightness = t.brightness ?? 0.94;
  const contrast = t.contrast ?? 0.97;
  const saturation = t.saturation ?? 0.92;
  const blur = t.compositeBlur ?? 0;
  const parts: string[] = [];
  if (brightness !== 1) parts.push(`brightness(${brightness})`);
  if (contrast !== 1) parts.push(`contrast(${contrast})`);
  if (saturation !== 1) parts.push(`saturate(${saturation})`);
  if (blur > 0) parts.push(`blur(${blur}px)`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function CompositedMockup({ backgroundUrl, posterImageUrl, template, alt, className }: CompositedMockupProps) {
  const [bgLoaded, setBgLoaded] = useState(false);
  const x = template.posterX!;
  const y = template.posterY!;
  const w = template.posterWidth!;
  const h = template.posterHeight!;
  const rot = template.rotation ?? 0;
  const br = template.borderRadius ?? 0;

  const fitMode = template.fitMode ?? "cover";
  const objectFit: React.CSSProperties["objectFit"] =
    fitMode === "contain" ? "contain" : fitMode === "stretch" ? "fill" : "cover";

  const shadowEnabled = template.shadowEnabled ?? true;
  const shadowOpacity = template.shadowOpacity ?? 0.4;
  const shadowBlur = template.shadowBlur ?? 20;
  const shadowOffsetX = template.shadowOffsetX ?? 2;
  const shadowOffsetY = template.shadowOffsetY ?? 6;

  const innerShadowEnabled = template.innerShadowEnabled ?? true;
  const innerShadowOpacity = template.innerShadowOpacity ?? 0.25;
  const innerShadowBlur = Math.max(shadowBlur * 0.6, 8);

  const posterFilter = buildPosterFilter(template);

  const dropShadow = shadowEnabled
    ? `drop-shadow(${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0,0,0,${shadowOpacity}))`
    : undefined;

  return (
    <div className={cn("relative w-full h-full", className)}>
      {!bgLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        src={backgroundUrl}
        alt={alt}
        className={cn("w-full h-full object-cover transition-opacity duration-300", bgLoaded ? "opacity-100" : "opacity-0")}
        onLoad={() => setBgLoaded(true)}
        onError={(e) => {
          (e.target as HTMLImageElement).src = posterImageUrl;
          setBgLoaded(true);
        }}
      />
      {bgLoaded && (
        <div
          className="absolute"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${w}%`,
            height: `${h}%`,
            transform: rot ? `rotate(${rot}deg)` : undefined,
            filter: dropShadow,
          }}
        >
          <div
            className="relative w-full h-full overflow-hidden"
            style={{
              borderRadius: br ? `${br}px` : undefined,
            }}
          >
            <img
              src={posterImageUrl}
              alt={alt}
              className="w-full h-full"
              style={{ objectFit, filter: posterFilter, display: "block" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            {innerShadowEnabled && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  borderRadius: br ? `${br}px` : undefined,
                  boxShadow: `inset 0 0 ${innerShadowBlur}px rgba(0,0,0,${innerShadowOpacity})`,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DisplayImage {
  url: string;
  label: string;
  mockup?: PosterMockup;
  isComposited?: boolean;
}

export const MockupGallery = ({
  mockups,
  fallbackImageUrl,
  alt,
  isLoading = false,
}: MockupGalleryProps) => {
  const visibleMockups = mockups.filter(isVisible);

  const allImages: DisplayImage[] = [
    { url: fallbackImageUrl, label: "Poster" },
    ...visibleMockups
      .map((m) => {
        const canComposite = hasPlacementData(m.template) && !!m.template?.backgroundImageUrl;
        const displayUrl =
          m.mockupImageUrl ??
          m.template?.backgroundImageUrl ??
          m.template?.previewThumbnailUrl ??
          null;

        if (!displayUrl && !canComposite) return null;

        return {
          url: canComposite
            ? m.template!.backgroundImageUrl!
            : (displayUrl ?? fallbackImageUrl),
          label: getFriendlyLabel(m),
          mockup: m,
          isComposited: canComposite,
        } as DisplayImage;
      })
      .filter((img): img is DisplayImage => img !== null),
  ].filter((img, idx, arr) =>
    arr.findIndex((x) => x.url === img.url && x.label === img.label) === idx
  );

  // Start on the best featured/primary mockup
  const primaryMockup =
    visibleMockups.find((m) => m.isPrimary && m.template?.isFeatured) ??
    visibleMockups.find((m) => m.template?.isFeatured) ??
    visibleMockups.find((m) => m.isPrimary) ??
    null;

  const primaryDisplayUrl = primaryMockup
    ? (primaryMockup.mockupImageUrl ?? primaryMockup.template?.backgroundImageUrl ?? primaryMockup.template?.previewThumbnailUrl ?? null)
    : null;

  const primaryIdx = primaryDisplayUrl
    ? allImages.findIndex(
        (i) =>
          i.url === primaryDisplayUrl ||
          i.mockup === primaryMockup ||
          (primaryMockup && i.mockup?.template?.backgroundImageUrl === primaryMockup.template?.backgroundImageUrl)
      )
    : 0;

  const [activeIdx, setActiveIdx] = useState(primaryIdx >= 0 ? primaryIdx : 0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(activeIdx);

  // Touch/swipe state for the main carousel
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mainImageRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only swipe if horizontal movement is dominant and significant
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) {
        setActiveIdx((i) => (i + 1) % allImages.length);
      } else {
        setActiveIdx((i) => (i - 1 + allImages.length) % allImages.length);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Non-passive touchmove listener to prevent horizontal page scroll
  // while swiping inside the gallery. React synthetic events are passive
  // by default so we attach directly to the DOM element.
  useEffect(() => {
    const el = mainImageRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      // If horizontal swipe is dominant, prevent the page from scrolling sideways
      if (Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const openLightbox = () => {
    setLightboxIdx(activeIdx);
    setLightboxOpen(true);
  };

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const prevLightbox = useCallback(
    () => setLightboxIdx((i) => (i - 1 + allImages.length) % allImages.length),
    [allImages.length]
  );
  const nextLightbox = useCallback(
    () => setLightboxIdx((i) => (i + 1) % allImages.length),
    [allImages.length]
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevLightbox();
      if (e.key === "ArrowRight") nextLightbox();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, closeLightbox, prevLightbox, nextLightbox]);

  // Skeleton state
  if (isLoading) {
    return (
      <div className="space-y-2.5" aria-busy="true">
        <div
          className="bg-muted animate-pulse"
          style={{ aspectRatio: "3/4", maxHeight: "420px" }}
        />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[68px] h-[68px] bg-muted animate-pulse rounded-sm" />
          ))}
        </div>
      </div>
    );
  }

  const activeItem = allImages[activeIdx] ?? { url: fallbackImageUrl, label: "Poster" };

  function renderMainImage(item: DisplayImage, className?: string) {
    if (
      item.isComposited &&
      item.mockup?.template &&
      hasPlacementData(item.mockup.template) &&
      item.mockup.template.backgroundImageUrl
    ) {
      return (
        <CompositedMockup
          backgroundUrl={item.mockup.template.backgroundImageUrl!}
          posterImageUrl={fallbackImageUrl}
          template={item.mockup.template}
          alt={alt}
          className={className}
        />
      );
    }
    return (
      <MainImage
        src={item.url}
        fallback={fallbackImageUrl}
        alt={alt}
        className={className}
      />
    );
  }

  return (
    <>
      <div className="space-y-2.5" data-testid="mockup-gallery">
        {/* Main image — flat poster style, no rounded corners, minimal shadow */}
        <div
          ref={mainImageRef}
          className="relative bg-[#f4f0eb] overflow-hidden cursor-zoom-in group select-none shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
          style={{ aspectRatio: "3/4", maxHeight: "420px" }}
          onClick={openLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {renderMainImage(activeItem)}

          {/* Subtle inset edge — gives the image a "print edge" depth cue */}
          <div
            className="absolute inset-0 ring-1 ring-inset ring-black/[0.06] pointer-events-none"
            aria-hidden="true"
          />

          {/* Swipe arrows on desktop when multiple images */}
          {allImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveIdx((i) => (i - 1 + allImages.length) % allImages.length); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/70 backdrop-blur-sm hover:bg-white/90 text-stone-700 rounded-full p-1.5 transition-all opacity-0 group-hover:opacity-100 shadow-sm md:flex hidden"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveIdx((i) => (i + 1) % allImages.length); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/70 backdrop-blur-sm hover:bg-white/90 text-stone-700 rounded-full p-1.5 transition-all opacity-0 group-hover:opacity-100 shadow-sm md:flex hidden"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Dot indicator on mobile */}
          {allImages.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 md:hidden pointer-events-none">
              {allImages.map((_, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    idx === activeIdx ? "bg-white w-3" : "bg-white/50"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {allImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {allImages.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                aria-label={img.label}
                aria-pressed={idx === activeIdx}
                className={cn(
                  "relative shrink-0 overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  activeIdx === idx
                    ? "border-primary opacity-100"
                    : "border-transparent opacity-50 hover:opacity-80"
                )}
                style={{ width: 68, height: 68 }}
              >
                {img.isComposited && img.mockup?.template?.backgroundImageUrl ? (
                  <img
                    src={img.mockup.template.backgroundImageUrl}
                    alt={img.label}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = fallbackImageUrl; }}
                  />
                ) : (
                  <img
                    src={img.url}
                    alt={img.label}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = fallbackImageUrl; }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div
            className="relative flex flex-col items-center w-full px-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-0 right-4 text-white/70 hover:text-white transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-7 h-7" />
            </button>

            {/* Image — let it define its own size within viewport limits */}
            <div className="relative flex items-center justify-center w-full mt-10">
              {allImages.length > 1 && (
                <button
                  onClick={prevLightbox}
                  className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/55 text-white rounded-full p-2 transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <LightboxImage
                item={allImages[lightboxIdx] ?? { url: fallbackImageUrl, label: "Poster" }}
                fallbackImageUrl={fallbackImageUrl}
                alt={alt}
              />

              {allImages.length > 1 && (
                <button
                  onClick={nextLightbox}
                  className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/55 text-white rounded-full p-2 transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Thumbnail strip — no labels */}
            {allImages.length > 1 && (
              <div className="flex gap-2 mt-4 overflow-x-auto pb-0.5">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setLightboxIdx(idx)}
                    aria-label={img.label}
                    className={cn(
                      "relative shrink-0 overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                      lightboxIdx === idx
                        ? "border-white opacity-100"
                        : "border-transparent opacity-40 hover:opacity-70"
                    )}
                    style={{ width: 56, height: 56 }}
                  >
                    <img
                      src={img.isComposited && img.mockup?.template?.backgroundImageUrl ? img.mockup.template.backgroundImageUrl : img.url}
                      alt={img.label}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = fallbackImageUrl;
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Lightbox image renderer — uses object-contain so portraits/squares/mockups
 * all display at their natural aspect ratio without cropping or stretching.
 */
function LightboxImage({
  item,
  fallbackImageUrl,
  alt,
}: {
  item: DisplayImage;
  fallbackImageUrl: string;
  alt: string;
}) {
  if (
    item.isComposited &&
    item.mockup?.template &&
    hasPlacementData(item.mockup.template) &&
    item.mockup.template.backgroundImageUrl
  ) {
    return (
      <div className="max-h-[82vh] max-w-[88vw] w-auto h-auto" style={{ aspectRatio: "3/4" }}>
        <CompositedMockup
          backgroundUrl={item.mockup.template.backgroundImageUrl!}
          posterImageUrl={fallbackImageUrl}
          template={item.mockup.template}
          alt={alt}
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <img
      src={item.url}
      alt={alt}
      className="block max-h-[82vh] max-w-[88vw] w-auto h-auto object-contain"
      onError={(e) => { (e.target as HTMLImageElement).src = fallbackImageUrl; }}
    />
  );
}

/** Simple image with fade-in and fallback, showing a skeleton while loading. */
function MainImage({
  src,
  fallback,
  alt,
  className,
}: {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const finalSrc = errored ? fallback : src;

  return (
    <div className={cn("relative w-full h-full", className)}>
      {!loaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
      <img
        key={finalSrc}
        src={finalSrc}
        alt={alt}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0"
        )}
        data-testid="mockup-gallery-main-image"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!errored) {
            setErrored(true);
            setLoaded(false);
          } else {
            setLoaded(true);
          }
        }}
      />
    </div>
  );
}
