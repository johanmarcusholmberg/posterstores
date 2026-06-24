---
name: Poster card presentation system
description: Three-mode artwork display for product-card grids; how modes work, where config lives, and the hover crossfade contract.
---

## Rule
`posterCardPresentation` is a store-level setting (DB column `stores.poster_card_presentation`, text). It controls how raw poster artwork is rendered inside the 3:4 card stage across all grids (Featured, New arrivals, Shop, Related).

**Modes:**
- `"current"` (null/default) — `object-contain` on `#f4f0eb` bg; no cropping; original behaviour.
- `"full-image"` — `object-cover`; fills the card; may crop extreme ratios.
- `"stage"` — centred in `inset-[6%]` wrapper with `drop-shadow`; best for mixed-ratio collections.

**Why:** User wanted non-destructive A/B testing; default must always be the safe fallback ("current") so existing stores are unaffected.

**How to apply:** `PosterCard` reads `store.posterCardPresentation ?? "current"` and passes it to `PosterArtworkStage`. Admin changes it in the store edit form ("Poster card presentation" card). The setting persists to the DB via the standard store PUT endpoint.

## Hover crossfade contract
`PosterArtworkStage` owns the hover crossfade. Both layers always in DOM:
- Base layer: `opacity-100 group-hover:opacity-0`, `duration-[600ms]`
- Hover overlay: `opacity-0 group-hover:opacity-100`, `duration-[600ms]`, `loading="eager"` (pre-loads)
- Result: symmetrical fade on hover-in AND hover-out, no flicker, no snap.

In `stage` mode the opacity transition is on the wrapper div (not the img), since the img is inside the centred div.
