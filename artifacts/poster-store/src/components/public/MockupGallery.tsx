import React, { useState, useEffect, useCallback, useRef } from "react";
import { type PosterMockup } from "@/lib/mockupApi";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

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

/**
 * Returns true when a mockup should be shown to customers on the public storefront.
 *
 * Public visibility rules (in order):
 *  1. isGallery=false  → hidden (admin explicitly excluded it from gallery)
 *  2. No mockupImageUrl → hidden (unsynced rows are admin-only)
 *  3. status=failed    → hidden (broken render, no usable image)
 *  4. Inactive template → hidden
 *  5. Everything else  → visible
 */
function isVisible(m: PosterMockup): boolean {
  // 1. Respect gallery flag
  if (m.isGallery === false) return false;
  // 2. Must have a generated final image
  if (!m.mockupImageUrl) return false;
  // 3. Failed renders are not customer-ready
  if (m.status === "failed") return false;
  // 4. Template must be active (orphaned rows without a template are fine if they have an image)
  if (!m.mockupTemplateId) return true;
  if (m.template) return m.template.active !== false;
  return false;
}

interface DisplayImage {
  url: string;
  label: string;
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
  const allImages: DisplayImage[] = [
    { url: fallbackImageUrl, label: "Poster", isPosterArtwork: true },
    ...visibleMockups.map((m) => ({
      url: m.mockupImageUrl!,   // always present after isVisible() filter
      label: getFriendlyLabel(m),
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
    ? allImages.findIndex((i) => i.url === primaryDisplayUrl)
    : 0;

  const [activeIdx, setActiveIdx] = useState(primaryIdx >= 0 ? primaryIdx : 0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(activeIdx);

  const thumbnailRailRef = useRef<HTMLDivElement>(null);

  const thumbnailButtonRefs = useRef<
    Array<HTMLButtonElement | null>
  >([]);

  const [canScrollThumbnailsUp, setCanScrollThumbnailsUp] =
    useState(false);

  const [canScrollThumbnailsDown, setCanScrollThumbnailsDown] =
    useState(false);

  const updateThumbnailScrollState = useCallback(() => {
    const rail = thumbnailRailRef.current;

    if (!rail) return;

    setCanScrollThumbnailsUp(rail.scrollTop > 2);

    setCanScrollThumbnailsDown(
      rail.scrollTop + rail.clientHeight <
        rail.scrollHeight - 2
    );
  }, []);

  const scrollThumbnails = useCallback(
    (direction: "up" | "down") => {
      const rail = thumbnailRailRef.current;

      if (!rail) return;

      const amount = Math.max(
        rail.clientHeight * 0.75,
        160
      );

      rail.scrollBy({
        top: direction === "down" ? amount : -amount,
        behavior: "smooth",
      });
    },
    []
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(
      updateThumbnailScrollState
    );

    window.addEventListener(
      "resize",
      updateThumbnailScrollState
    );

    return () => {
      window.cancelAnimationFrame(frame);

      window.removeEventListener(
        "resize",
        updateThumbnailScrollState
      );
    };
  }, [allImages.length, updateThumbnailScrollState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const rail = thumbnailRailRef.current;
      const selectedButton =
        thumbnailButtonRefs.current[activeIdx];

      if (
        !rail ||
        !selectedButton ||
        rail.clientHeight === 0
      ) {
        return;
      }

      const buttonTop = selectedButton.offsetTop;
      const buttonBottom =
        buttonTop + selectedButton.offsetHeight;

      const visibleTop = rail.scrollTop;
      const visibleBottom =
        visibleTop + rail.clientHeight;

      if (buttonTop < visibleTop) {
        rail.scrollTo({
          top: buttonTop,
          behavior: "smooth",
        });
      } else if (buttonBottom > visibleBottom) {
        rail.scrollTo({
          top: buttonBottom - rail.clientHeight,
          behavior: "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeIdx]);
  
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

  const handleLightboxBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Outside-click closing is desktop/tablet only
      if (!window.matchMedia("(min-width: 768px)").matches) return;

      const mainImage =
        e.currentTarget.querySelector<HTMLImageElement>(
          '[data-lightbox-main-image="true"]'
        );

      if (
        !mainImage ||
        mainImage.naturalWidth === 0 ||
        mainImage.naturalHeight === 0
      ) {
        closeLightbox();
        return;
      }

      const box = mainImage.getBoundingClientRect();
      const naturalRatio =
        mainImage.naturalWidth / mainImage.naturalHeight;
      const boxRatio = box.width / box.height;

      let visibleLeft = box.left;
      let visibleTop = box.top;
      let visibleWidth = box.width;
      let visibleHeight = box.height;

      // Calculate the actual visible image area when object-contain is used
      if (naturalRatio > boxRatio) {
        visibleHeight = box.width / naturalRatio;
        visibleTop = box.top + (box.height - visibleHeight) / 2;
      } else {
        visibleWidth = box.height * naturalRatio;
        visibleLeft = box.left + (box.width - visibleWidth) / 2;
      }

      const clickedOnVisibleImage =
        e.clientX >= visibleLeft &&
        e.clientX <= visibleLeft + visibleWidth &&
        e.clientY >= visibleTop &&
        e.clientY <= visibleTop + visibleHeight;

      if (!clickedOnVisibleImage) {
        closeLightbox();
      }
    },
    [closeLightbox]
  );
  
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
      <div className="flex w-full flex-col-reverse gap-2.5 md:max-w-[500px] md:flex-row md:items-start md:gap-3.5 lg:max-w-none xl:gap-4" aria-busy="true">
        <div className="flex flex-row gap-2 md:w-[96px] md:shrink-0 md:flex-col xl:w-[112px]">
          {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="
            h-[68px] w-[68px] shrink-0 rounded-sm
            bg-muted animate-pulse
            md:h-auto md:w-[92px] md:aspect-[5/7]
            xl:w-[108px]
          "
        />
          ))}
        </div>
        <div className="aspect-[5/7] w-full bg-muted animate-pulse md:min-w-0 md:flex-1" />
      </div>
    );
  }

  const activeItem = allImages[activeIdx] ?? { url: fallbackImageUrl, label: "Poster", isPosterArtwork: true };

  function renderMainImage(item: DisplayImage, className?: string) {
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
          className="
            flex w-full min-w-0 flex-col-reverse gap-2.5
            overflow-hidden
            md:max-w-[500px]
            md:flex-row
            md:items-stretch
            md:gap-3.5
            lg:max-w-none
            xl:gap-4
          "
          data-testid="mockup-gallery"
        >

        {/* Mobile thumbnail carousel */}
        {allImages.length > 1 && (
          <div
            className="
              flex gap-2 overflow-x-auto pb-0.5
              md:hidden
              overscroll-x-contain
              scroll-smooth
              [scrollbar-width:none]
              [&::-webkit-scrollbar]:hidden
            "
          >
            {allImages.map((img, idx) => {
              const isActive = idx === activeIdx;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIdx(idx);
                  }}
                  aria-label={img.label}
                  aria-pressed={isActive}
                  className={cn(
                    `
                      relative h-[68px] w-[68px] shrink-0
                      overflow-hidden border-2
                      bg-[#faf8f3]
                      transition-all
                      focus-visible:outline-none
                      focus-visible:ring-2
                      focus-visible:ring-primary
                    `,
                    isActive
                      ? "border-primary"
                      : "border-transparent hover:opacity-80"
                  )}
                >
                  <img
                    src={img.url}
                    alt={alt}
                    className={cn(
                      "block h-full w-full",
                      img.isPosterArtwork
                        ? "object-contain"
                        : "object-cover"
                    )}
                    onError={(e) => {
                      (
                        e.target as HTMLImageElement
                      ).src = fallbackImageUrl;
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop vertical thumbnail carousel */}
        {allImages.length > 1 && (
          <div
            className="
              relative hidden shrink-0 self-stretch
              md:block md:w-[96px]
              xl:w-[112px]
            "
          >
            <button
              type="button"
              onClick={() => scrollThumbnails("up")}
              disabled={!canScrollThumbnailsUp}
              aria-label="Show previous images"
              className="
                absolute left-1/2 top-2 z-20
                flex h-8 w-8 -translate-x-1/2
                items-center justify-center
                rounded-full border border-border
                bg-background/90 shadow-md backdrop-blur-sm
                transition-all
                hover:bg-muted
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-primary
                disabled:pointer-events-none
                disabled:opacity-0
              "
            >
              <ChevronUp className="h-4 w-4" />
            </button>

              <div
                ref={thumbnailRailRef}
                onScroll={updateThumbnailScrollState}
                className="
                  absolute inset-0
                  overflow-y-auto overflow-x-hidden
                  overscroll-contain scroll-smooth
                  snap-y snap-proximity
                  [scrollbar-width:none]
                  [&::-webkit-scrollbar]:hidden
                "
              >
              <div className="flex flex-col items-center gap-2">
                {allImages.map((img, idx) => {
                  const isActive = idx === activeIdx;

                  return (
                    <button
                      key={idx}
                      ref={(element) => {
                        thumbnailButtonRefs.current[idx] =
                          element;
                      }}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveIdx(idx);
                      }}
                      aria-label={img.label}
                      aria-pressed={isActive}
                      className={cn(
                        "relative aspect-[5/7] w-[92px] shrink-0 snap-start overflow-hidden border-2 bg-[#faf8f3] transition-[border-color,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary xl:w-[108px]",
                        isActive
                          ? "border-primary opacity-100 ring-1 ring-primary/20 shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
                          : "border-border/50 opacity-85 hover:border-primary/40 hover:opacity-100"
                      )}
                    >
                      <img
                        src={img.url}
                        alt={alt}
                        className={cn(
                          "block h-full w-full",
                          img.isPosterArtwork
                            ? "object-contain"
                            : "object-cover"
                        )}
                        onError={(e) => {
                          (
                            e.target as HTMLImageElement
                          ).src = fallbackImageUrl;
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {canScrollThumbnailsUp && (
              <div
                className="
                  pointer-events-none absolute
                  inset-x-0 top-0 z-10 h-14
                  bg-gradient-to-b
                  from-background/90 to-transparent
                "
                aria-hidden="true"
              />
            )}

            {canScrollThumbnailsDown && (
              <div
                className="
                  pointer-events-none absolute
                  inset-x-0 bottom-0 z-10 h-14
                  bg-gradient-to-t
                  from-background/90 to-transparent
                "
                aria-hidden="true"
              />
            )}

            <button
              type="button"
              onClick={() => scrollThumbnails("down")}
              disabled={!canScrollThumbnailsDown}
              aria-label="Show more images"
              className="
                absolute bottom-0 left-1/2 z-20
                flex h-8 w-8 -translate-x-1/2
                items-center justify-center
                rounded-full border border-border
              bg-background/90 shadow-md backdrop-blur-sm
                transition-all
                hover:bg-muted
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-primary
                disabled:pointer-events-none
                disabled:opacity-0
              "
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Main image — same sizing/aspect/background approach as the New Arrivals poster card.
            Poster artwork keeps the stage transparent (like NewArrivalCard) so unused
            letterbox space shows the page background instead of a visible cream box.
            Mockups keep the cream background since they always fill the stage.
            The drop shadow also moves to the image wrapper for poster artwork (see MainImage)
            so it hugs the actual image instead of outlining the whole fixed stage. */}
        <div
          ref={mainImageRef}
          className={cn(
            "relative aspect-[5/7] w-full min-w-0 overflow-hidden cursor-zoom-in group select-none md:w-auto md:flex-1",
            !activeItem.isPosterArtwork && "bg-[#faf8f3] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
          )}
          onClick={openLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {renderMainImage(activeItem)}

          {/* Subtle inset edge — gives mockup images a "print edge" depth cue.
              Poster artwork gets its own ring that hugs the actual image instead
              (see MainImage), since the artwork doesn't fill this fixed stage. */}
          {!activeItem.isPosterArtwork && (
            <div
              className="absolute inset-0 ring-1 ring-inset ring-black/[0.06] pointer-events-none"
              aria-hidden="true"
            />
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
      </div>
      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={handleLightboxBackdropClick}
        >  
          <div
            className="relative flex flex-col items-center w-full px-4">
            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
              }}
              className="absolute top-0 right-4 text-white/70 hover:text-white transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-7 h-7" />
            </button>

            {/* Image zone — fixed height so thumbnails never shift when images change ratio */}
            <div
              className="
                relative flex items-center justify-center
                w-[calc(100vw-2rem)]
                sm:w-[calc(100vw-6rem)]
                max-w-[1600px]
                mt-8
                h-[66vh]
                sm:h-[72vh]
                lg:h-[76vh]
                max-h-[820px]
              "
            >
              {allImages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prevLightbox();
                  }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/55 text-white rounded-full p-2 transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <LightboxImage
                key={lightboxIdx}
                item={allImages[lightboxIdx] ?? {
                  url: fallbackImageUrl,
                  label: "Poster",
                }}
                fallbackImageUrl={fallbackImageUrl}
                alt={alt}
              />

              {allImages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nextLightbox();
                  }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/55 text-white rounded-full p-2 transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Thumbnail strip — no labels */}
            {allImages.length > 1 && (
              <div className="flex max-w-[calc(100vw-2rem)] gap-3 mt-5 overflow-x-auto px-1 pb-1">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIdx(idx);
                    }}
                    aria-label={img.label}
                    className={cn(
                      `
                        relative h-[72px] w-[72px] shrink-0
                        overflow-hidden border-2
                        transition-[border-color,box-shadow,opacity]
                        duration-200 ease-out
                        focus-visible:outline-none
                        focus-visible:ring-2
                        focus-visible:ring-white

                        sm:h-[88px] sm:w-[88px]
                      `,
                      lightboxIdx === idx
                        ? `
                            border-white
                            opacity-100
                            ring-2 ring-white/20
                            shadow-[0_3px_10px_rgba(0,0,0,0.25)]
                          `
                        : `
                            border-transparent
                            opacity-40
                            hover:opacity-70
                          `
                    )}
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
 * All public gallery items are flattened generated images, rendered as a plain <img>.
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
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const imageSrc = useFallback ? fallbackImageUrl : item.url;

  const imageStyle: React.CSSProperties =
    naturalRatio === null
      ? {
          width: "auto",
          height: "auto",
          maxWidth: "100%",
          maxHeight: "100%",
        }
      : naturalRatio < 1
        ? {
            height: "100%",
            width: "auto",
            maxWidth: "100%",
          }
        : {
            width: "100%",
            height: "auto",
            maxHeight: "100%",
          };

  return (
    <img
      key={imageSrc}
      src={imageSrc}
      alt={alt}
      data-lightbox-main-image="true"
      className="block shrink-0 object-contain"
      style={imageStyle}
      onLoad={(e) => {
        const image = e.currentTarget;

        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          setNaturalRatio(
            image.naturalWidth / image.naturalHeight
          );
        }
      }}
      onError={() => {
        if (!useFallback) {
          setUseFallback(true);
          setNaturalRatio(null);
        }
      }}
    />
  );
}

/**
 * Returns orientation-aware CSS for the inner poster-artwork wrapper, mirroring
 * PosterArtworkStage (New Arrivals): the outer stage stays a fixed size, and this
 * wrapper hugs the actual image ratio, centered within it.
 *
 * Before load (null): fills the stage so the object-contain img is visible.
 * Portrait (< 1):  height 100%, auto width — fills stage vertically, centers horizontally.
 * Landscape/sq (≥ 1): width 100%, auto height — fills stage horizontally, centers vertically.
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

/**
 * Main gallery image.
 *
 * Mockups: fill the fixed stage edge-to-edge with object-cover (unchanged behavior).
 * Poster artwork: like PosterArtworkStage, the stage size never changes — an inner
 * wrapper is sized to the image's real ratio and centered, with object-contain so
 * nothing is ever cropped or stretched.
 */
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
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const finalSrc = errored ? fallback : src;

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    setLoaded(true);
    if (isPosterArtwork) {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalRatio(img.naturalWidth / img.naturalHeight);
      }
    }
  }

  function handleError() {
    if (!errored) {
      setErrored(true);
      setLoaded(false);
      setNaturalRatio(null);
    } else {
      setLoaded(true);
    }
  }

  if (!isPosterArtwork) {
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
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          data-testid="mockup-gallery-main-image"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    );
  }

  const wrapperStyle = artworkWrapperStyle(naturalRatio);
  const hasRatio = naturalRatio !== null;

  return (
    <div
      className={cn(
        "relative w-full h-full flex items-start justify-center",
        className
      )}
    >
      {!loaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
      <div
        className={cn(hasRatio && "ring-1 ring-inset ring-black/[0.14] shadow-[0_1px_4px_rgba(0,0,0,0.06)]")}
        style={wrapperStyle}
      >
        <img
          key={finalSrc}
          src={finalSrc}
          alt={alt}
          fetchPriority="high"
          decoding="async"
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          data-testid="mockup-gallery-main-image"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
}
