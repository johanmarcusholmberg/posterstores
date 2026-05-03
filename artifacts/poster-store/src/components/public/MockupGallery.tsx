import React, { useState, useEffect, useCallback, useRef } from "react";
import { type PosterMockup, type PosterMockupTemplate } from "@/lib/mockupApi";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

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

function CompositedMockup({ backgroundUrl, posterImageUrl, template, alt, className }: CompositedMockupProps) {
  const [bgLoaded, setBgLoaded] = useState(false);
  const x = template.posterX!;
  const y = template.posterY!;
  const w = template.posterWidth!;
  const h = template.posterHeight!;
  const rot = template.rotation ?? 0;
  const br = template.borderRadius ?? 0;
  const shadow = template.shadowStrength ?? 0;

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
          className="absolute overflow-hidden"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${w}%`,
            height: `${h}%`,
            transform: rot ? `rotate(${rot}deg)` : undefined,
            borderRadius: br ? `${br}px` : undefined,
            boxShadow: shadow > 0
              ? `0 ${shadow * 20}px ${shadow * 40}px rgba(0,0,0,${shadow * 0.5})`
              : undefined,
          }}
        >
          <img
            src={posterImageUrl}
            alt={alt}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
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
          className="bg-muted animate-pulse rounded-xl"
          style={{ aspectRatio: "3/4", maxHeight: "420px" }}
        />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[68px] h-[68px] bg-muted animate-pulse rounded-lg" />
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
        {/* Main image */}
        <div
          className="relative bg-muted rounded-xl overflow-hidden shadow-md cursor-zoom-in group select-none"
          style={{ aspectRatio: "3/4", maxHeight: "420px" }}
          onClick={openLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {renderMainImage(activeItem)}

          {/* Zoom hint */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 pointer-events-none">
            <div className="bg-white/80 backdrop-blur-sm rounded-full p-2 shadow">
              <ZoomIn className="w-5 h-5 text-stone-700" />
            </div>
          </div>

          {/* Swipe arrows on mobile when multiple images */}
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
                  "relative shrink-0 rounded-lg overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  activeIdx === idx
                    ? "border-primary opacity-100 shadow-sm"
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
                {/* Friendly label chip */}
                <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center leading-tight py-0.5 px-0.5 truncate">
                  {img.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div
            className="relative flex flex-col items-center max-w-3xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeLightbox}
              className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-7 h-7" />
            </button>

            <div
              className="relative w-full rounded-xl overflow-hidden bg-black/20 shadow-2xl"
              style={{ maxHeight: "75vh", aspectRatio: "3/4" }}
            >
              {renderMainImage(allImages[lightboxIdx] ?? { url: fallbackImageUrl, label: "Poster" })}

              {allImages.length > 1 && (
                <>
                  <button
                    onClick={prevLightbox}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextLightbox}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox label */}
            <p className="mt-2 text-white/60 text-sm">
              {allImages[lightboxIdx]?.label ?? "Poster"}
            </p>

            {allImages.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-0.5">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setLightboxIdx(idx)}
                    aria-label={img.label}
                    className={cn(
                      "relative shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                      lightboxIdx === idx
                        ? "border-white opacity-100"
                        : "border-transparent opacity-40 hover:opacity-70"
                    )}
                    style={{ width: 64, height: 64 }}
                  >
                    <img
                      src={img.url}
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
