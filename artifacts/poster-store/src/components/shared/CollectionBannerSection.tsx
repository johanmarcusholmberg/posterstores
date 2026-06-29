import React from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { type Poster } from "@workspace/api-client-react";
import { type CollectionBannerVisualConfig } from "@/config/storefronts";
import {
  focalToObjectPosition,
  resolveHomepageLink,
  makeShopUrl,
  cleanColor,
  fontFamilyFromOverride,
} from "@/lib/bannerUtils";

export interface CollectionBannerSectionProps {
  banner: CollectionBannerVisualConfig;
  staticBanner?: { title: string; text: string; ctaText?: string; ctaLink?: string } | null;
  collectionPreviewPosters: Poster[];
  resolvedRoutePrefix: string | null;
  /** Override the banner's own displayStyle (used by shop grid to apply shopDisplayStyle). */
  displayStyleOverride?: "visual" | "simple";
  /** Override the banner's own mobileMode (used by shop grid to apply shopMobileMode). */
  mobileModeOverride?: "full-banner" | "simplified-card" | "hidden";
}

export function CollectionBannerSection({
  banner,
  staticBanner,
  collectionPreviewPosters,
  resolvedRoutePrefix,
  displayStyleOverride,
  mobileModeOverride,
}: CollectionBannerSectionProps) {
  const hasCollBg = !!banner.backgroundImageUrl;
  const imageFit = banner.imageFit ?? "cover";
  const objectPos = focalToObjectPosition(banner.focalPointX, banner.focalPointY);
  const showPosters = banner.showPosterCards === true;

  const textHAlign = banner.textHAlign ?? "left";
  const textVAlign = banner.textVAlign ?? "center";
  const textMaxWidth = banner.textMaxWidth ?? "medium";
  const textOverlay = banner.textOverlay ?? "none";
  const mobileMode = mobileModeOverride ?? banner.mobileMode ?? "simplified-card";
  const textOffsetX = banner.textOffsetX ?? 0;
  const textOffsetY = banner.textOffsetY ?? 0;
  const textOffsetStyle: React.CSSProperties =
    (textOffsetX !== 0 || textOffsetY !== 0)
      ? { transform: `translate(${textOffsetX}px, ${textOffsetY}px)` }
      : {};

  const textMaxWidthClass =
    textMaxWidth === "narrow" ? "max-w-xs" : textMaxWidth === "wide" ? "max-w-md" : "max-w-sm";

  const contentVAlignClass =
    textVAlign === "top" ? "items-start pt-8" : textVAlign === "bottom" ? "items-end pb-8" : "items-center";

  const textColumnAlignClass =
    textHAlign === "center" ? "mx-auto text-center" : textHAlign === "right" ? "ml-auto text-right" : "";

  const textOverlayCls =
    textOverlay === "soft-panel" ? "bg-black/35 backdrop-blur-sm rounded-xl px-5 py-4" : "";

  const cbTitle = banner.title ?? staticBanner?.title ?? "Mediterranean Walls";
  const cbText = banner.text ?? staticBanner?.text;
  const cbCtaText = banner.ctaText ?? staticBanner?.ctaText ?? "Explore collection";
  const cbCtaLink = banner.ctaLink ?? staticBanner?.ctaLink;
  const cbEyebrow = banner.eyebrow;

  const resolvedCtaHref = cbCtaLink
    ? resolveHomepageLink(resolvedRoutePrefix, cbCtaLink)
    : makeShopUrl(resolvedRoutePrefix);

  const co = banner.colorOverrides;
  const fo = banner.fontOverrides;
  const bannerEyebrowColor = cleanColor(co?.eyebrowColor);
  const bannerHeadingColor = cleanColor(co?.headingColor);
  const bannerHeadingFont = fontFamilyFromOverride(fo?.headingFont);
  const bannerTextColor = cleanColor(co?.textColor);
  const bannerBodyFont = fontFamilyFromOverride(fo?.bodyFont);
  const bannerLinkColor = cleanColor(co?.linkColor);
  const bannerBgColor = cleanColor(co?.backgroundColor);
  const bannerOverlayColor = cleanColor(co?.overlayColor);
  const bannerOverlayOpacity = co?.overlayOpacity ?? null;

  const overlayStyle: React.CSSProperties = (() => {
    if (bannerOverlayColor || bannerOverlayOpacity != null) {
      const style: React.CSSProperties = {
        backgroundColor: bannerOverlayColor ?? `rgba(0,0,0,${bannerOverlayOpacity ?? 0.35})`,
      };
      if (bannerOverlayColor && bannerOverlayOpacity != null) style.opacity = bannerOverlayOpacity;
      return style;
    }
    return { backgroundColor: `rgba(0,0,0,${banner.backgroundOverlayOpacity ?? 0.35})` };
  })();

  const eyebrowStyle: React.CSSProperties = bannerEyebrowColor ? { color: bannerEyebrowColor } : {};
  const headingStyle: React.CSSProperties = {
    ...(bannerHeadingColor ? { color: bannerHeadingColor } : {}),
    ...(bannerHeadingFont ? { fontFamily: bannerHeadingFont } : {}),
  };
  const textStyle: React.CSSProperties = {
    ...(bannerTextColor ? { color: bannerTextColor } : {}),
    ...(bannerBodyFont ? { fontFamily: bannerBodyFont } : {}),
  };
  const ctaStyle: React.CSSProperties = bannerLinkColor ? { color: bannerLinkColor } : {};

  const textContent = (
    <>
      {cbEyebrow && (
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.18em] mb-2.5",
            !bannerEyebrowColor && "text-foreground/45"
          )}
          style={Object.keys(eyebrowStyle).length > 0 ? eyebrowStyle : undefined}
        >
          {cbEyebrow}
        </p>
      )}
      <h2
        className={cn(
          "font-serif text-2xl sm:text-3xl font-bold leading-tight mb-3",
          !bannerHeadingColor && "text-primary"
        )}
        style={Object.keys(headingStyle).length > 0 ? headingStyle : undefined}
      >
        {cbTitle}
      </h2>
      {cbText && (
        <p
          className={cn(
            "text-sm leading-relaxed mb-5",
            textMaxWidthClass,
            !bannerTextColor && "text-foreground/65"
          )}
          style={Object.keys(textStyle).length > 0 ? textStyle : undefined}
        >
          {cbText}
        </p>
      )}
      <Link
        href={resolvedCtaHref}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-semibold hover:underline",
          !bannerLinkColor && "text-primary"
        )}
        style={Object.keys(ctaStyle).length > 0 ? ctaStyle : undefined}
      >
        {cbCtaText} &rarr;
      </Link>
    </>
  );

  const posterCards = showPosters && collectionPreviewPosters.length > 0 ? (
    <div className="flex-none flex items-end gap-2.5 sm:gap-3">
      {collectionPreviewPosters.map((poster, idx) => {
        const slug = (poster as any).slug as string | undefined;
        const href = slug ? `/posters/${slug}` : `/poster/${poster.id}`;
        const displayImg = poster.primaryDisplayImageUrl ?? poster.imageUrl;
        return (
          <Link
            key={poster.id}
            href={href}
            className={["flex-none group", idx === 2 ? "hidden sm:block" : ""].join(" ")}
          >
            <div className="w-[60px] sm:w-[72px] lg:w-[84px] bg-[#faf8f4] p-1 pb-2.5 rounded-[2px] shadow-[0_4px_14px_rgba(0,0,0,0.22)] group-hover:-translate-y-1 transition-transform duration-200">
              <div className="relative aspect-[3/4] bg-[#ece7de] overflow-hidden">
                <img
                  src={displayImg}
                  alt={poster.title}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = poster.imageUrl; }}
                />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  ) : null;

  const gradientOverlay = textOverlay === "gradient" && hasCollBg ? (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none",
        textHAlign === "right"
          ? "bg-gradient-to-l from-black/55 via-black/20 to-transparent"
          : textHAlign === "center"
          ? "bg-gradient-to-b from-black/35 via-black/10 to-transparent"
          : "bg-gradient-to-r from-black/55 via-black/20 to-transparent"
      )}
    />
  ) : null;

  const desktopBanner = (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.10)]",
        mobileMode === "simplified-card" && "hidden sm:block",
        mobileMode === "hidden" && "hidden sm:block",
      )}
      style={!hasCollBg ? { backgroundColor: bannerBgColor ?? "#EBD9C4" } : undefined}
    >
      {hasCollBg ? (
        <>
          <img
            src={banner.backgroundImageUrl ?? undefined}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className={cn(
              "w-full aspect-[18/5] sm:aspect-[13/2] block",
              imageFit === "contain" ? "object-contain bg-sand" : "object-cover"
            )}
            style={imageFit === "cover" ? { objectPosition: objectPos } : undefined}
          />
          <div className="absolute inset-0" style={overlayStyle} />
          {gradientOverlay}
        </>
      ) : null}

      <div
        className={cn(
          "z-10 px-6 lg:px-10",
          hasCollBg
            ? cn("absolute inset-0 flex", contentVAlignClass)
            : "relative py-8 lg:py-10"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-7 sm:gap-10 lg:gap-14 w-full">
          <div
            className={cn("flex-1 min-w-0", textColumnAlignClass, textOverlayCls)}
            style={Object.keys(textOffsetStyle).length > 0 ? textOffsetStyle : undefined}
          >
            {cbEyebrow && (
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.18em] mb-2.5",
                  !bannerEyebrowColor && (hasCollBg ? "text-white/60" : "text-foreground/45")
                )}
                style={Object.keys(eyebrowStyle).length > 0 ? eyebrowStyle : undefined}
              >
                {cbEyebrow}
              </p>
            )}
            <h2
              className={cn(
                "font-serif text-2xl sm:text-3xl font-bold leading-tight mb-3",
                !bannerHeadingColor && (hasCollBg ? "text-white" : "text-primary")
              )}
              style={Object.keys(headingStyle).length > 0 ? headingStyle : undefined}
            >
              {cbTitle}
            </h2>
            {cbText && (
              <p
                className={cn(
                  "text-sm leading-relaxed mb-5",
                  textMaxWidthClass,
                  !bannerTextColor && (hasCollBg ? "text-white/75" : "text-foreground/65")
                )}
                style={Object.keys(textStyle).length > 0 ? textStyle : undefined}
              >
                {cbText}
              </p>
            )}
            <Link
              href={resolvedCtaHref}
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-semibold hover:underline",
                !bannerLinkColor && (hasCollBg ? "text-white" : "text-primary")
              )}
              style={Object.keys(ctaStyle).length > 0 ? ctaStyle : undefined}
            >
              {cbCtaText} &rarr;
            </Link>
          </div>

          {posterCards}
        </div>
      </div>
    </div>
  );

  const mobileCard = mobileMode === "simplified-card" ? (
    <div
      className="sm:hidden rounded-2xl px-5 py-6"
      style={{ backgroundColor: bannerBgColor ?? "#EBD9C4" }}
    >
      {textContent}
    </div>
  ) : null;

  const effectiveDisplayStyle = displayStyleOverride ?? banner.displayStyle;

  if (effectiveDisplayStyle === "simple") {
    return (
      <section className="py-2 lg:py-3">
        <div className="container mx-auto max-w-screen-2xl px-6 lg:px-10">
          <div
            className="rounded-2xl px-6 lg:px-10 py-7 lg:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5"
            style={{ backgroundColor: bannerBgColor ?? "#ede8e0" }}
          >
            <div className="min-w-0">
              {cbEyebrow && (
                <p
                  className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] mb-1.5", !bannerEyebrowColor && "text-foreground/45")}
                  style={bannerEyebrowColor ? { color: bannerEyebrowColor } : undefined}
                >
                  {cbEyebrow}
                </p>
              )}
              <h2
                className={cn("font-serif text-xl sm:text-2xl font-bold leading-tight", !bannerHeadingColor && "text-primary")}
                style={bannerHeadingColor ? { color: bannerHeadingColor } : undefined}
              >
                {cbTitle}
              </h2>
              {cbText && (
                <p
                  className={cn("text-sm mt-1.5 max-w-sm", !bannerTextColor && "text-foreground/65")}
                  style={bannerTextColor ? { color: bannerTextColor } : undefined}
                >
                  {cbText}
                </p>
              )}
            </div>

            <div className="flex items-center gap-5 shrink-0">
              {posterCards}
              <Link
                href={resolvedCtaHref}
                className={cn("inline-flex items-center gap-1.5 text-sm font-semibold hover:underline whitespace-nowrap", !bannerLinkColor && "text-primary")}
                style={bannerLinkColor ? { color: bannerLinkColor } : undefined}
              >
                {cbCtaText} &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-2 lg:py-3">
      <div className={cn("container mx-auto max-w-screen-2xl px-6 lg:px-10", mobileMode === "simplified-card" && "space-y-2 sm:space-y-0")}>
        {mobileCard}
        {desktopBanner}
      </div>
    </section>
  );
}
