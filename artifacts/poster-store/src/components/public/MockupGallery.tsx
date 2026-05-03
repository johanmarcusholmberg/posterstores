import React, { useState, useEffect, useCallback } from "react";
import { type PosterMockup } from "@/lib/mockupApi";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

interface MockupGalleryProps {
  mockups: PosterMockup[];
  fallbackImageUrl: string;
  alt: string;
}

function getDisplayUrl(m: PosterMockup, fallback: string): string {
  if (m.mockupImageUrl) return m.mockupImageUrl;
  if (m.template?.previewThumbnailUrl) return m.template.previewThumbnailUrl;
  return fallback;
}

export const MockupGallery = ({
  mockups,
  fallbackImageUrl,
  alt,
}: MockupGalleryProps) => {
  const allImages = [
    { url: fallbackImageUrl, label: "Original" },
    ...mockups.map((m) => ({
      url: getDisplayUrl(m, fallbackImageUrl),
      label: m.template?.name ?? "Custom",
    })),
  ].filter((img, idx, arr) => arr.findIndex((x) => x.url === img.url) === idx);

  const primaryMockup = mockups.find((m) => m.isPrimary) ?? mockups[0] ?? null;
  const primaryUrl = primaryMockup ? getDisplayUrl(primaryMockup, fallbackImageUrl) : fallbackImageUrl;
  const primaryIdx = allImages.findIndex((i) => i.url === primaryUrl);

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

  const activeUrl = allImages[activeIdx]?.url ?? fallbackImageUrl;

  return (
    <>
      <div className="space-y-2.5" data-testid="mockup-gallery">
        {/* Main image — click to enlarge */}
        <div
          className="relative bg-muted rounded-xl overflow-hidden shadow-md cursor-zoom-in group"
          style={{ aspectRatio: "3/4", maxHeight: "420px" }}
          onClick={openLightbox}
        >
          <img
            src={activeUrl}
            alt={alt}
            className="w-full h-full object-cover transition-opacity duration-200"
            data-testid="mockup-gallery-main-image"
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallbackImageUrl;
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
            <div className="bg-white/80 backdrop-blur-sm rounded-full p-2 shadow">
              <ZoomIn className="w-5 h-5 text-stone-700" />
            </div>
          </div>
        </div>

        {/* Thumbnail strip — no labels */}
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
            {/* Close */}
            <button
              onClick={closeLightbox}
              className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-7 h-7" />
            </button>

            {/* Main lightbox image */}
            <div className="relative w-full rounded-xl overflow-hidden bg-black/20 shadow-2xl">
              <img
                src={allImages[lightboxIdx]?.url ?? fallbackImageUrl}
                alt={alt}
                className="w-full max-h-[75vh] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = fallbackImageUrl;
                }}
              />

              {/* Prev / Next arrows */}
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

            {/* Lightbox thumbnail strip */}
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
