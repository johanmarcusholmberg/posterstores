---
name: Homepage section-level visual overrides
description: Where font/color overrides are stored and how they are rendered for each homepage section type.
---

## Storage pattern

- **Section font/color overrides** (heading color, text color, bg, overlay, posterTitleColor, posterPriceColor) → stored on `HomepageSectionConfig.colorOverrides` / `HomepageSectionConfig.fontOverrides` in the `sections` array inside `homepageVisualConfig`.
- **Hero button individual styles** (textColor, backgroundColor, borderColor) → stored on `HeroVisualConfig.primaryButtonStyle`, `HeroVisualConfig.secondaryButtonStyle`, and per-button `HeroButtonConfig.style` for extra buttons.
- **Collection banner overrides** → stored directly on `CollectionBannerVisualConfig.colorOverrides` / `.fontOverrides` (not on the section).

## Key types (in both storefronts.ts and adminApi.ts — must stay in sync)

- `HeroButtonStyleConfig` — `{ textColor, backgroundColor, borderColor }`
- `SectionColorOverrides` — includes `posterTitleColor`, `posterPriceColor`, `overlayOpacity` (0–1)
- `SectionFontOverrides` — `{ headingFont, bodyFont }`

## Backend validation (stores.ts)

- `heroButtonStyleSchema` — nullable optional, validated on hero button objects and on `primaryButtonStyle`/`secondaryButtonStyle` of hero visual
- `sectionColorOverridesSchema.overlayOpacity` — validated with `.min(0).max(1)` (not just nullable)

## Admin UI pattern

- Override panels are `CollapsibleOverridePanel` components, **closed by default**
- Helper components: `ColorField` (color picker + hex input + clear), `FontField` (text input)
- `updateSectionOverrides(type, field, patch)` merges patch into the matching section's override object
- `restoreDefaultOrder` must preserve `fontOverrides` + `colorOverrides` from `currentById.get(def.id)` — NOT just `visible`

## Rendering pattern (Home.tsx)

- Each section component receives `sectionConfig?: HomepageSectionConfig | null`
- Helpers: `cleanColor(c)` → `string | undefined`, `fontFamilyFromOverride(f)` → `string | undefined`, `buttonStyleFromOverride(s)` → `React.CSSProperties | undefined`
- Override inline styles take precedence over Tailwind className colors (CSS specificity)
- `FeaturedPosterCard` and `NewArrivalCard` accept `titleColor?` / `priceColor?` props

**Why:** Section-level overrides allow per-section brand customization without modifying global store theme, enabling multi-store reuse with different visual identities per section.
