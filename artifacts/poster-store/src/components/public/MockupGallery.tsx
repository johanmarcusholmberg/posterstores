import React, { useState, useEffect, useCallback } from "react";
import { type PosterMockup, type PosterMockupTemplate } from "@/lib/mockupApi";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

interface MockupGalleryProps {
  mockups: PosterMockup[];
  fallbackImageUrl: string;
  alt: string;
}

/**
 * Returns the URL to display for a poster mockup row.
 * Custom image URLs take priority; then template background image; then thumbnail.
 * Returns null when nothing is renderable.
 */
function getDisplayUrl(m: PosterMockup): string | null {
  if (m.mockupImageUrl) return m.mockupImageUrl;
  if (m.template?.backgroundImageUrl) return m.template.backgroundImageUrl;
  if (m.template?.previewThumbnailUrl) return m.template.previewThumbnailUrl;
  return null;
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
 * Returns true when a mockup row should be shown to public users.
 * Rows whose template is inactive are hidden; custom-URL rows (no template) are always shown.
 */
function isVisible(m: PosterMockup): boolean {
  // Custom image URL with no template → always visible
  if (!m.mockupTemplateId) return true;
  // If template is present in the join, check active flag
  if (m.template) return m.template.active !== false;
  // Template ID exists but join returned null (template was deleted) → hide
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
  const x = template.posterX!;
  const y = template.posterY!;
  const w = template.posterWidth!;
  const h = template.posterHeight!;
  const rot = template.rotation ?? 0;
  const br = template.borderRadius ?? 0;
  const shadow = template.shadowStrength ?? 0;

  return (
    <div className={cn("relative w-full h-full", className)}>
      <img
        src={backgroundUrl}
        alt={alt}
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).src = posterImageUrl; }}
      />
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
}: MockupGalleryProps) => {
  // Filter out inactive template mockups before building the display list
  const visibleMockups = mockups.filter(isVisible);

  const allImages: DisplayImage[] = [
    { url: fallbackImageUrl, label: "Original" },
    ...visibleMockups
      .map((m) => {
        const canComposite =
          hasPlacementData(m.template) && !!m.template?.backgroundImageUrl;
        const displayUrl = m.mockupImageUrl ?? m.template?.backgroundImageUrl ?? m.template?.previewThumbnailUrl ?? null;

        if (!displayUrl && !canComposite) return null;

        return {
          url: canComposite
            ? m.template!.backgroundImageUrl!
            : (displayUrl ?? fallbackImageUrl),
          label: m.template?.name ?? "Custom",
          mockup: m,
          isComposited: canComposite,
        } as DisplayImage;
      })
      .filter((img): img is DisplayImage => img !== null),
  ].filter((img, idx, arr) =>
    arr.findIndex((x) => x.url === img.url && x.label === img.label) === idx
  );

  // Prioritise featured template among visible mockups, then isPrimary, then first
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

  const openLightbox = () => {
    setLightboxIdx(activeIdx);
    setLightboxOpen(true);
  };

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const prev = useCallback(
    () => setLightboxIdx((i) => (i - 1 + allImages.length) % allImages.length),
    [allImages.length]
  );
  const next = useCallback(
    () => setLightboxIdx((i) => (i + 1) % allImages.length),
    [allImages.length]
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, closeLightbox, prev, next]);

  const activeItem = allImages[activeIdx] ?? { url: fallbackImageUrl, label: "Original" };

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
      <img
        src={item.url}
        alt={alt}
        className={cn("w-full h-full object-cover transition-opacity duration-200", className)}
        data-testid="mockup-gallery-main-image"
        onError={(e) => {
          (e.target as HTMLImageElement).src = fallbackImageUrl;
        }}
      />
    );
  }

  return (
    <>
      <div className="space-y-2.5" data-testid="mockup-gallery">
        <div
          className="relative bg-muted rounded-xl overflow-hidden shadow-md cursor-zoom-in group"
          style={{ aspectRatio: "3/4", maxHeight: "420px" }}
          onClick={openLightbox}
        >
          {renderMainImage(activeItem)}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
            <div className="bg-white/80 backdrop-blur-sm rounded-full p-2 shadow">
              <ZoomIn className="w-5 h-5 text-stone-700" />
            </div>
          </div>
        </div>

        {allImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {allImages.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                title={img.label}
                className={cn(
                  "relative shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                  activeIdx === idx
                    ? "border-primary opacity-100"
                    : "border-transparent opacity-50 hover:opacity-80"
                )}
                style={{ width: 68, height: 68 }}
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
              {renderMainImage(allImages[lightboxIdx] ?? { url: fallbackImageUrl, label: "Original" })}

              {allImages.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={next}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {allImages.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setLightboxIdx(idx)}
                    title={img.label}
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
