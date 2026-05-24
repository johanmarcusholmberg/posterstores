import { useEffect, useRef } from "react";
import { useStorefront } from "@/context/StorefrontContext";
import type { StoreTypographyConfig } from "@/config/storefronts";

const GOOGLE_FONT_FAMILIES = new Set([
  "Playfair Display",
  "Cormorant Garamond",
  "Lora",
  "Libre Baskerville",
  "Merriweather",
  "Inter",
  "DM Sans",
  "Source Sans 3",
  "Manrope",
]);

function toGoogleFontsParam(family: string): string {
  return family.replace(/ /g, "+");
}

function fontToCssValue(font: string | undefined): string | null {
  if (!font || font === "System default") return null;
  const isSerif = ["Playfair Display", "Cormorant Garamond", "Lora", "Libre Baskerville", "Merriweather"].includes(font);
  return `'${font}', ${isSerif ? "serif" : "sans-serif"}`;
}

function loadGoogleFonts(families: string[]) {
  const needed = families.filter((f) => GOOGLE_FONT_FAMILIES.has(f));
  if (needed.length === 0) return;

  const id = "store-theme-google-fonts";
  const existing = document.getElementById(id);

  const params = needed.map((f) => `family=${toGoogleFontsParam(f)}:wght@300;400;500;600;700`).join("&");
  const href = `https://fonts.googleapis.com/css2?${params}&display=swap`;

  if (existing) {
    if ((existing as HTMLLinkElement).href === href) return;
    existing.remove();
  }

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function buildCssVars(typo: StoreTypographyConfig | null | undefined): Record<string, string> {
  if (!typo) return {};
  const vars: Record<string, string> = {};

  const logoFontCss = fontToCssValue(typo.logoFont);
  const headingFontCss = fontToCssValue(typo.headingFont);
  const bodyFontCss = fontToCssValue(typo.bodyFont);

  if (logoFontCss) vars["--store-font-logo"] = logoFontCss;
  if (headingFontCss) vars["--store-font-heading"] = headingFontCss;
  if (bodyFontCss) vars["--store-font-body"] = bodyFontCss;

  if (typo.headingColor) vars["--store-heading-color"] = typo.headingColor;
  if (typo.linkColor) vars["--store-link-color"] = typo.linkColor;
  if (typo.buttonTextColor) vars["--store-btn-text-color"] = typo.buttonTextColor;

  const mode = typo.heroTextMode;
  if (mode === "dark") {
    vars["--store-hero-heading-color"] = typo.heroHeadingColor ?? "hsl(207 24% 16%)";
    vars["--store-hero-subtitle-color"] = typo.heroSubtitleColor ?? "rgba(31,42,51,0.65)";
    vars["--store-hero-eyebrow-color"] = typo.heroEyebrowColor ?? "rgba(31,42,51,0.5)";
    vars["--store-hero-bullet-color"] = typo.heroBulletColor ?? "rgba(31,42,51,0.4)";
  } else if (mode === "light") {
    vars["--store-hero-heading-color"] = typo.heroHeadingColor ?? "#ffffff";
    vars["--store-hero-subtitle-color"] = typo.heroSubtitleColor ?? "rgba(255,255,255,0.8)";
    vars["--store-hero-eyebrow-color"] = typo.heroEyebrowColor ?? "rgba(255,255,255,0.6)";
    vars["--store-hero-bullet-color"] = typo.heroBulletColor ?? "rgba(255,255,255,0.5)";
  } else if (mode === "custom") {
    if (typo.heroHeadingColor) vars["--store-hero-heading-color"] = typo.heroHeadingColor;
    if (typo.heroSubtitleColor) vars["--store-hero-subtitle-color"] = typo.heroSubtitleColor;
    if (typo.heroEyebrowColor) vars["--store-hero-eyebrow-color"] = typo.heroEyebrowColor;
    if (typo.heroBulletColor) vars["--store-hero-bullet-color"] = typo.heroBulletColor;
  }

  const overlayMode = typo.heroOverlayMode;
  if (overlayMode === "none") {
    vars["--store-hero-overlay-color"] = "rgba(0,0,0,0)";
  } else if (overlayMode === "light") {
    const opacity = typo.heroOverlayOpacity ?? 0.25;
    vars["--store-hero-overlay-color"] = `rgba(255,255,255,${opacity})`;
  } else if (overlayMode === "dark") {
    const opacity = typo.heroOverlayOpacity ?? 0.3;
    vars["--store-hero-overlay-color"] = `rgba(0,0,0,${opacity})`;
  } else if (overlayMode === "custom") {
    const opacity = typo.heroOverlayOpacity ?? 0.3;
    vars["--store-hero-overlay-color"] = `rgba(0,0,0,${opacity})`;
  }

  return vars;
}

export function StoreThemeApplicator() {
  const store = useStorefront();
  const typo = store.typographyConfig;
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    rootRef.current = document.getElementById("store-theme-root");
  }, []);

  useEffect(() => {
    const fontsToLoad: string[] = [];
    if (typo?.logoFont && GOOGLE_FONT_FAMILIES.has(typo.logoFont)) fontsToLoad.push(typo.logoFont);
    if (typo?.headingFont && GOOGLE_FONT_FAMILIES.has(typo.headingFont)) fontsToLoad.push(typo.headingFont);
    if (typo?.bodyFont && GOOGLE_FONT_FAMILIES.has(typo.bodyFont)) fontsToLoad.push(typo.bodyFont);
    const unique = [...new Set(fontsToLoad)];
    loadGoogleFonts(unique);

    const root = document.getElementById("store-theme-root");
    if (!root) return;

    const vars = buildCssVars(typo);
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(key, val);
    }

    const knownVars = [
      "--store-font-logo", "--store-font-heading", "--store-font-body",
      "--store-heading-color", "--store-link-color", "--store-btn-text-color",
      "--store-hero-heading-color", "--store-hero-subtitle-color",
      "--store-hero-eyebrow-color", "--store-hero-bullet-color",
      "--store-hero-overlay-color",
    ];
    for (const key of knownVars) {
      if (!(key in vars)) {
        root.style.removeProperty(key);
      }
    }
  }, [typo]);

  return null;
}
