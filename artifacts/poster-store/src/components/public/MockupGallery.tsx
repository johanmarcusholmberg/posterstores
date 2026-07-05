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
 * Returns true when a mockup should be shown to customers on the public storefront.
 *
 * Public visibility rules (in order):
 *  1. isGallery=false  → hidden (admin explicitly excluded it from gallery)
 *  2. No mockupImageUrl → hidden (live CSS composites / unsynced rows are admin-only)
 *  3. status=failed    → hidden (broken render, no usable image)
 *  4. ai_rendered without approvedForPublic → hidden (awaiting admin approval)
 *  5. Inactive template → hidden
 *  6. Everything else  → visible
 *
 * Note: CompositedMockup (live CSS overlay) is intentionally excluded from the
 * public gallery. It is admin-preview-only. Only generated flat images (mockupImageUrl)
 * are shown to customers.
 */
function isVisible(m: PosterMockup): boolean {
  // 1. Respect gallery flag
  if (m.isGallery === false) return false;
  // 2. Must have a generated final image — unsynced/live-composite rows are admin-only
  if (!m.mockupImageUrl) return false;
  // 3. Failed renders are not customer-ready
  if (m.status === "failed") return false;
  // 4. AI-rendered mockups require explicit admin approval before going public
  if (m.renderMode === "ai_rendered" && !m.approvedForPublic) return false;
  // 5. Template must be active (orphaned rows without a template are fine if they have an image)
  if (!m.mockupTemplateId) return true;
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
        decoding="async"
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
  /** True for the raw poster artwork — use object-contain so no cropping occurs. */
  isPosterArtwork?: boolean;
}

export const MockupGallery = ({
  mockups,
  fallbackImageUrl,
  alt,
  isLoading = false,
}: MockupGalleryProps) => {
  const visibleMockups = mockups.filter(isVisible);

  // isVisible() guarantees every entry in visibleMockups has a mockupImageUrl.
  // Live CSS composites (no generated image) are filtered out before reaching here —
  // they are admin-preview-only and never shown to public customers.
  const allImages: DisplayImage[] = [
    { url: fallbackImageUrl, label: "Poster", isPosterArtwork: true },
    ...visibleMockups.map((m) => ({
      url: m.mockupImageUrl!,   // always present after isVisible() filter
      label: getFriendlyLabel(m),
      mockup: m,
      isComposited: false,      // public gallery never does live CSS compositing
    } as DisplayImage)),
  ].filter((img, idx, arr) =>
    arr.findIndex((x) => x.url === img.url && x.label === img.label) === idx
  );

  // Start on the best featured/primary mockup
  const primaryMockup =
    visibleMockups.find((m) => m.isPrimary && m.template?.isFeatured) ??
    visibleMockups.find((m) => m.template?.isFeatured) ??
    visibleMockups.find((m) => m.isPrimary) ??
    null;

  // All visible mockups have mockupImageUrl, so use that as the lookup key.
  const primaryDisplayUrl = primaryMockup?.mockupImageUrl ?? null;

  const primaryIdx = primaryDisplayUrl
    ? allImages.findIndex(
        (i) => i.url === primaryDisplayUrl || i.mockup === primaryMockup
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
      <div className="flex flex-col-reverse md:flex-row md:items-start gap-2.5 md:gap-3.5" aria-busy="true">
        <div className="flex flex-row md:flex-col gap-2 md:w-[72px] md:shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[68px] h-[68px] bg-muted animate-pulse rounded-sm" />
          ))}
        </div>
        <div
          className="bg-muted animate-pulse sm:max-h-[420px] w-full"
          style={{ aspectRatio: "5/7" }}
        />
      </div>
    );
  }

  const activeItem = allImages[activeIdx] ?? { url: fallbackImageUrl, label: "Poster" };

  function renderMainImage(item: DisplayImage, className?: string) {
    // isComposited is always false in the public gallery (isVisible() requires mockupImageUrl).
    // The CompositedMockup branch below is retained as a safety net but will not execute
    // for public storefront users. Live CSS compositing is admin-preview-only.
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
        isPosterArtwork={item.isPosterArtwork}
      />
    );
  }

  return (
    <>
      <div
        className="flex flex-col-reverse md:flex-row md:items-start gap-2.5 md:gap-3.5"
        data-testid="mockup-gallery"
      >
        {/* Thumbnail strip — below main image on mobile, left column on desktop */}
        {allImages.length > 1 && (
          <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-0.5 md:pb-0 scrollbar-hide md:w-[72px] md:max-h-[420px] md:shrink-0">
            {allImages.map((img, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  aria-label={img.label}
                  aria-pressed={isActive}
                  className={cn(
                    "relative shrink-0 overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary bg-[#faf8f3]",
                    isActive ? "border-primary" : "border-transparent hover:opacity-80"
                  )}
                  style={{ width: 68, height: 68 }}
                >
                  <img
                    src={img.url}
                    alt={img.label}
                    loading="lazy"
                    decoding="async"
                    className={cn("w-full h-full", img.isPosterArtwork ? "object-contain" : "object-cover")}
                    onError={(e) => { (e.target as HTMLImageElement).src = fallbackImageUrl; }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Main image — same sizing/aspect/background approach as the New Arrivals poster card */}
        <div
          ref={mainImageRef}
          className="relative bg-[#faf8f3] overflow-hidden cursor-zoom-in group select-none shadow-[0_1px_4px_rgba(0,0,0,0.06)] sm:max-h-[420px] w-full"
          style={{ aspectRatio: "5/7" }}
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

            {/* Image zone — fixed height so thumbnails never shift when images change ratio */}
            <div className="relative flex items-center justify-center w-full mt-10 h-[60vh] sm:h-[72vh]">
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
                      src={img.url}
                      alt={img.label}
                      loading="lazy"
                      decoding="async"
                      className={cn("w-full h-full", img.isPosterArtwork ? "object-contain" : "object-cover")}
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
 * Lightbox image renderer.
 *
 * Public gallery: isComposited is always false (isVisible() requires mockupImageUrl),
 * so all items render as a plain <img> with object-contain. The CompositedMockup path
 * is gone — live CSS compositing is admin-preview-only and never reaches the lightbox.
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
  return (
    <img
      src={item.url}
      alt={alt}
      className="block max-w-full max-h-full w-auto h-auto object-contain"
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
  isPosterArtwork,
}: {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
  isPosterArtwork?: boolean;
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
        fetchPriority="high"
        decoding="async"
        className={cn(
          "w-full h-full transition-opacity duration-300",
          isPosterArtwork ? "object-contain" : "object-cover",
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
