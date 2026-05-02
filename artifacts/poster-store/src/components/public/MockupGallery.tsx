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
    <div className="space-y-3" data-testid="mockup-gallery">
      <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden shadow-lg">
        <img
          src={active}
          alt={alt}
          className="w-full h-full object-cover"
          data-testid="mockup-gallery-main-image"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackImageUrl;
          }}
        />
      </div>

      {uniqueImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {uniqueImages.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActive(img.url)}
              title={img.label}
              className={cn(
                "shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all",
                active === img.url
                  ? "border-primary"
                  : "border-transparent opacity-60 hover:opacity-100"
              )}
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
  );
};
