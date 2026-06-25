---
name: Ratio-wrapper sizing for absolutely-positioned children
description: CSS aspect-ratio inner wrappers silently collapse to 0×0 when their only children are absolutely positioned — fix is to set an explicit starting axis dimension.
---

## The rule

When using an inner ratio-wrapper div to size an artwork area (the pattern used in PosterArtworkStage, HomePosterCard, FeaturedPosterCard, NewArrivalCard), always set `width: "100%"` on it — never `maxWidth: "100%"` alone.

```jsx
// WRONG — collapses to 0×0 when img is absolute inset-0
style={{ aspectRatio: "0.714", maxWidth: "100%", maxHeight: "100%" }}

// CORRECT — browser computes height from width + aspect-ratio, max-height caps portrait overflow
style={{ aspectRatio: "0.714", width: "100%", maxHeight: "100%" }}
```

**Why:** `aspect-ratio` needs one concrete axis to derive the other. An absolutely-positioned child (`absolute inset-0`) contributes zero to the parent's intrinsic size. So `maxWidth: 100% + maxHeight: 100%` with no explicit width/height gives the browser nothing to start from — the flex child reports zero intrinsic size and renders invisible. Setting `width: 100%` gives a concrete starting width; `aspect-ratio` then computes the height; `max-height: 100%` prevents portrait overflow beyond the card.

**How to apply:**
- Applies everywhere a ratio-aware inner wrapper contains only absolutely-positioned content (images, overlays).
- The pair `width: 100%; maxHeight: 100%; aspectRatio: ratio` works for all orientations:
  - Portrait (ratio < 1): fills card width, height = width/ratio capped at card height → thin side gaps
  - Landscape (ratio > 1): fills card width, height < card height → warm background above/below
  - Square: fills card width, roughly equal height
