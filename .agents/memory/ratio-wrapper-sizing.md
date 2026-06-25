---
name: Ratio-wrapper sizing for absolutely-positioned children
description: Artwork ratio for poster cards must come from naturalWidth/naturalHeight on image load — NOT print-size labels. Orientation-aware CSS needed for portrait vs landscape.
---

## The ratio source rule

**Never use `posterSizes` / print-size labels to determine artwork orientation.** A landscape photo can have print sizes like A4, A3, 50x70 (all portrait dimensions). Using those labels causes landscape photos to be wrongly treated as portrait.

**Correct source:** Read `img.naturalWidth / img.naturalHeight` in the `onLoad` handler and store in `useState`. Example:

```tsx
const [ratio, setRatio] = useState<number | null>(null);
// on img:
onLoad={(e) => {
  const img = e.currentTarget;
  if (img.naturalWidth > 0 && img.naturalHeight > 0)
    setRatio(img.naturalWidth / img.naturalHeight);
}}
```

## Orientation-aware wrapper CSS

```ts
function artworkInnerStyle(ratio: number | null): React.CSSProperties {
  if (ratio === null) return { position: "absolute", inset: 0 };  // full-card fallback before load
  if (ratio < 1)
    return { position: "relative", aspectRatio: String(ratio), height: "100%", width: "auto", maxWidth: "100%" };
  return { position: "relative", aspectRatio: String(ratio), width: "100%", height: "auto", maxHeight: "100%" };
}
```

Portrait (< 1): fill card height → tiny side gaps.
Landscape/square (≥ 1): fill card width → background blends above/below.
Before load (null): `absolute inset-0` so object-contain img is visible during loading.

**Why:** `aspect-ratio` needs one concrete axis. An absolutely-positioned child contributes zero intrinsic size, so `maxWidth + maxHeight` alone collapses the wrapper to 0×0. Setting an explicit `height: 100%` (portrait) or `width: 100%` (landscape) gives the browser a starting axis.

**How to apply:**
- Ring (`ring-1 ring-inset ring-black/[0.14]`) on the inner wrapper: only add it when `ratio !== null` so it hugs artwork, not the full card during load.
- Outer container stays fixed (e.g. `aspect-[3/4]`) — never changes on ratio update.
- `object-cover` only on hover mockup/lifestyle overlays, never on actual artwork.
