/**
 * Returns an optimized Unsplash image URL with the requested width and quality.
 * Non-Unsplash URLs are returned unchanged so the function is safe to apply
 * to any poster imageUrl regardless of source.
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  { width, quality = 75 }: { width: number; quality?: number },
): string {
  if (!url) return url ?? "";
  if (!url.includes("images.unsplash.com")) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(width));
    u.searchParams.set("q", String(quality));
    return u.toString();
  } catch {
    return url;
  }
}
