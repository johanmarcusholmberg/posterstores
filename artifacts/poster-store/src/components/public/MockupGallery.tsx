import React, { useState } from "react";
import { type PosterMockup } from "@/lib/mockupApi";
import { cn } from "@/lib/utils";

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
  const primaryMockup =
    mockups.find((m) => m.isPrimary) ?? (mockups[0] || null);
  const [active, setActive] = useState<string>(
    primaryMockup ? getDisplayUrl(primaryMockup, fallbackImageUrl) : fallbackImageUrl
  );

  const allImages = [
    { url: fallbackImageUrl, label: "Original" },
    ...mockups.map((m) => ({
      url: getDisplayUrl(m, fallbackImageUrl),
      label: m.template?.name ?? "Custom",
    })),
  ];

  const uniqueImages = allImages.filter(
    (img, idx, arr) => arr.findIndex((x) => x.url === img.url) === idx
  );

  return (
    <div className="space-y-2.5" data-testid="mockup-gallery">
      <div className="relative bg-muted rounded-xl overflow-hidden shadow-md" style={{ aspectRatio: "3/4", maxHeight: "420px" }}>
        <img
          src={active}
          alt={alt}
          className="w-full h-full object-cover transition-opacity duration-200"
          data-testid="mockup-gallery-main-image"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackImageUrl;
          }}
        />
      </div>

      {uniqueImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {uniqueImages.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActive(img.url)}
              title={img.label}
              className={cn(
                "relative shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                active === img.url
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
              <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[9px] text-center py-0.5 font-medium leading-tight">
                {img.label}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
