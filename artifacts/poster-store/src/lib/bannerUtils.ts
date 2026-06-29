/** Shared utilities used by banner components (homepage + shop grid). */

/** Build a /shop URL, prepending a routePrefix when present. */
export function makeShopUrl(routePrefix: string | null, query?: string): string {
  const base = routePrefix ? `/${routePrefix}/shop` : "/shop";
  return query ? `${base}?${query}` : base;
}

/**
 * Resolve a homepage link respecting route prefix.
 * - Blank/null → default /shop
 * - Absolute http(s) URL → returned as-is (no prefix)
 * - Relative starting with "/" → prefix prepended
 */
export function resolveHomepageLink(routePrefix: string | null, href?: string | null): string {
  if (!href || !href.trim()) return makeShopUrl(routePrefix);
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) {
    return routePrefix ? `/${routePrefix}${trimmed}` : trimmed;
  }
  return routePrefix ? `/${routePrefix}/${trimmed}` : `/${trimmed}`;
}

/** Map focal point label to CSS percentage for object-position. */
const FOCAL_X: Record<string, string> = { left: "0%", center: "50%", right: "100%" };
const FOCAL_Y: Record<string, string> = { top: "0%", center: "50%", bottom: "100%" };

export function focalToObjectPosition(
  x: string | null | undefined,
  y: string | null | undefined
): string {
  return `${FOCAL_X[x ?? "center"] ?? "50%"} ${FOCAL_Y[y ?? "center"] ?? "50%"}`;
}

export function fontFamilyFromOverride(font?: string | null): string | undefined {
  return font && font.trim() ? font.trim() : undefined;
}

export function cleanColor(color?: string | null): string | undefined {
  return color && color.trim() ? color.trim() : undefined;
}
