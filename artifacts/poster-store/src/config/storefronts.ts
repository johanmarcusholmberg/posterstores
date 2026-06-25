export interface HeroButtonStyleConfig {
  textColor?: string | null;
  backgroundColor?: string | null;
  borderColor?: string | null;
}

export interface HeroButtonConfig {
  id: string;
  label: string;
  link: string;
  variant?: "filled" | "outline";
  visible?: boolean;
  style?: HeroButtonStyleConfig | null;
  /** If false, button is hidden on desktop screens (≥sm). Defaults to true. */
  showDesktop?: boolean;
  /** If false, button is hidden on mobile screens (<sm). Defaults to true. */
  showMobile?: boolean;
}

export interface HeroTrustBadge {
  id: string;
  text: string;
  /** If false, badge is hidden on mobile screens (<sm). Defaults to true. */
  showMobile?: boolean;
}

export interface HeroVisualConfig {
  backgroundImageUrl?: string | null;
  backgroundStoragePath?: string | null;
  backgroundOverlayOpacity?: number;
  primaryButtonText?: string | null;
  primaryButtonVariant?: "filled" | "outline";
  primaryButtonLink?: string | null;
  primaryButtonStyle?: HeroButtonStyleConfig | null;
  secondaryButtonText?: string | null;
  secondaryButtonVariant?: "filled" | "outline";
  secondaryButtonLink?: string | null;
  secondaryButtonStyle?: HeroButtonStyleConfig | null;
  /**
   * Optional extra hero buttons shown after the primary/secondary buttons.
   * Existing primary/secondary fields remain the main backwards-compatible buttons.
   */
  extraButtons?: HeroButtonConfig[];
  /** If false, the primary button is hidden on mobile (<sm). Defaults to true. */
  primaryButtonShowMobile?: boolean;
  /** If false, the primary button is hidden on desktop (≥sm). Defaults to true. */
  primaryButtonShowDesktop?: boolean;
  /** If false, the secondary button is hidden on mobile (<sm). Defaults to true. */
  secondaryButtonShowMobile?: boolean;
  /** If false, the secondary button is hidden on desktop (≥sm). Defaults to true. */
  secondaryButtonShowDesktop?: boolean;
  /**
   * Editable trust badges rendered below the buttons.
   * Falls back to the three default badges when absent.
   */
  trustBadges?: HeroTrustBadge[];
}

export interface SectionFontOverrides {
  headingFont?: string | null;
  bodyFont?: string | null;
}

export interface SectionColorOverrides {
  eyebrowColor?: string | null;
  headingColor?: string | null;
  textColor?: string | null;
  linkColor?: string | null;
  buttonTextColor?: string | null;
  backgroundColor?: string | null;
  overlayColor?: string | null;
  overlayOpacity?: number | null;
  /** Homepage poster-card text only — used for Featured/New arrivals section cards. */
  posterTitleColor?: string | null;
  posterPriceColor?: string | null;
}

export interface CollectionBannerVisualConfig {
  id?: string;
  visible?: boolean;
  backgroundImageUrl?: string | null;
  backgroundStoragePath?: string | null;
  backgroundOverlayOpacity?: number;
  eyebrow?: string | null;
  title?: string | null;
  text?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
  imageFit?: "cover" | "contain";
  focalPointX?: "left" | "center" | "right";
  focalPointY?: "top" | "center" | "bottom";
  showPosterCards?: boolean;
  fontOverrides?: SectionFontOverrides | null;
  colorOverrides?: SectionColorOverrides | null;
  /** Horizontal alignment of the text column. Default: "left". */
  textHAlign?: "left" | "center" | "right";
  /** Vertical alignment of the text content when banner has a background image. Default: "center". */
  textVAlign?: "top" | "center" | "bottom";
  /** Max-width cap for the text column. Default: "medium". */
  textMaxWidth?: "narrow" | "medium" | "wide";
  /** Semi-transparent overlay behind the text block for improved readability. Default: "none". */
  textOverlay?: "none" | "soft-panel" | "gradient";
  /** How the banner is rendered on mobile screens. Default: "simplified-card". */
  mobileMode?: "full-banner" | "simplified-card" | "hidden";
  /** Fine-tune horizontal position of the text column in pixels. Default: 0. */
  textOffsetX?: number;
  /** Fine-tune vertical position of the text column in pixels. Default: 0. */
  textOffsetY?: number;
}

export type HomepageSectionType =
  | "hero"
  | "featuredPosters"
  | "collectionBanner"
  | "exploreLinks"
  | "newArrivals"
  | "brandStory"
  | "valueProps";

export interface HomepageSectionConfig {
  id: string;
  type: HomepageSectionType;
  visible: boolean;
  sortOrder: number;
  titleOverride?: string | null;
  bannerId?: string | null;
  fontOverrides?: SectionFontOverrides | null;
  colorOverrides?: SectionColorOverrides | null;
}

export interface HomepageVisualConfig {
  hero?: HeroVisualConfig;
  sections?: HomepageSectionConfig[];
  collectionBanners?: CollectionBannerVisualConfig[];
  /** @deprecated Legacy single-banner field — kept as backwards-compatible fallback. */
  collectionBanner?: CollectionBannerVisualConfig;
}

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionConfig[] = [
  { id: "hero", type: "hero", visible: true, sortOrder: 10 },
  { id: "featured-posters", type: "featuredPosters", visible: true, sortOrder: 20 },
  { id: "collection-banner-default", type: "collectionBanner", visible: true, sortOrder: 30, bannerId: "default" },
  { id: "explore-links", type: "exploreLinks", visible: true, sortOrder: 40 },
  { id: "new-arrivals", type: "newArrivals", visible: true, sortOrder: 50 },
  { id: "brand-story", type: "brandStory", visible: true, sortOrder: 60 },
  { id: "value-props", type: "valueProps", visible: true, sortOrder: 70 },
];

export type HeroTextMode = "dark" | "light" | "custom";
export type HeroOverlayMode = "none" | "light" | "dark" | "custom";

export interface StoreTypographyConfig {
  logoFont?: string;
  headingFont?: string;
  bodyFont?: string;
  headingColor?: string;
  linkColor?: string;
  buttonTextColor?: string;
  heroTextMode?: HeroTextMode;
  heroEyebrowColor?: string;
  heroHeadingColor?: string;
  heroSubtitleColor?: string;
  heroBulletColor?: string;
  heroOverlayMode?: HeroOverlayMode;
  heroOverlayOpacity?: number;
}

export type PosterCardPresentation = "current" | "full-image" | "stage";

export interface StorefrontConfig {
  storeKey: string;
  storeName: string;
  countryFocus: string;
  defaultCurrency: string;
  defaultLanguage?: string;
  primaryDomain?: string | null;
  domainAliases?: string[] | null;
  routePrefix?: string | null;
  typographyConfig?: StoreTypographyConfig | null;
  /**
   * Controls how poster artwork is presented in card grids (Featured, New arrivals, Shop).
   * @deprecated The universal stage is always used; this field is ignored at runtime.
   */
  posterCardPresentation?: PosterCardPresentation | null;
  /**
   * Product card stage background color (hex). Controls the neutral mat/background
   * visible around artwork in poster cards. Defaults to #f4f0eb (warm neutral).
   */
  productCardBgColor?: string | null;
  theme?: {
    background: string;
    surface: string;
    sand: string;
    primary: string;
    secondary: string;
    text: string;
    muted: string;
    border: string;
  };
  homepage: {
    heroTitle: string;
    heroSubtitle: string;
    primaryCta?: string;
    secondaryCta?: string;
    newsletterTitle?: string;
    newsletterSubtitle?: string;
    brandStory?: string;
  };
  shop?: {
    shopTagline?: string;
    introTitle?: string;
    introSubtitle?: string;
    introTrustNotes?: string[];
    trustLine?: string;
    regionFilterLabel?: string;
    allRegionsLabel?: string;
    categoryFilterLabel?: string;
    allCategoriesLabel?: string;
    collectionBanner?: {
      title: string;
      text: string;
      ctaText?: string;
      ctaLink?: string;
    };
  };
  regions: string[];
  cities: string[];
  categories?: string[];
  tags?: string[];
  seo?: {
    defaultTitle: string;
    defaultDescription: string;
  };
  logoUrl?: string | null;
  logoAltText?: string | null;
  homepageVisualConfig?: HomepageVisualConfig | null;
}

export const storefronts: Record<string, StorefrontConfig> = {
  postsofspain: {
    storeKey: "postsofspain",
    storeName: "PostersofSpain",
    countryFocus: "Spain",
    defaultCurrency: "EUR",
    defaultLanguage: "en",
    theme: {
      background: "#FAF6EF",
      surface: "#FFFFFF",
      sand: "#E8D8C3",
      primary: "#2F80A8",
      secondary: "#C86B4A",
      text: "#1F2A33",
      muted: "#8A9A5B",
      border: "#E4DDD3"
    },
    homepage: {
      heroTitle: "Posters inspired by Spain",
      heroSubtitle: "Mediterranean places, colors and moments — printed for your home.",
      primaryCta: "Browse posters",
      secondaryCta: "Explore regions",
      newsletterTitle: "Get new Spanish poster releases in your inbox",
      newsletterSubtitle: "Be the first to see new collections, city drops and seasonal releases."
    },
    shop: {
      shopTagline: "Spain-inspired wall art · Premium matte paper · Multiple sizes",
      introTitle: "Posters inspired by Spain's regions, cities and coastlines",
      introSubtitle: "Curated wall art from Valencia, Andalucía, Madrid, Galicia and beyond — designed for warm, Mediterranean interiors.",
      introTrustNotes: ["Premium matte paper", "Multiple sizes available", "Printed for modern homes"],
      trustLine: "Free EU shipping over €60 · Secure checkout · Printed on demand",
      regionFilterLabel: "Explore Spain",
      allRegionsLabel: "All of Spain",
      categoryFilterLabel: "Shop by style",
      allCategoriesLabel: "All styles",
      collectionBanner: {
        title: "Mediterranean Walls",
        text: "Warm-toned prints inspired by Spanish streets, terraces and coastlines.",
        ctaText: "Explore coastal posters",
        ctaLink: "/shop?category=Coastal+Posters",
      },
    },
    regions: ["Valencia","Andalusia","Catalonia","Madrid","Balearic Islands","Basque Country","Galicia","Canary Islands"],
    cities: ["Valencia","Barcelona","Madrid","Sevilla","Málaga","Alicante","Granada","Bilbao","Cádiz","Palma"],
    categories: ["Spanish Cities","Coastal Posters","Food & Drinks","Architecture","Botanical","Travel Posters","Minimal Posters","Vintage Posters","Café Posters"],
    tags: ["Mediterranean","Café","Orange","Architecture","Beach","Summer","Kitchen","Gallery wall","Botanical","Vintage","Minimal","Terracotta","Blue","Coastal"],
    seo: {
      defaultTitle: "PostersofSpain — Art Posters of Spain",
      defaultDescription: "Discover beautifully printed posters inspired by Spanish cities, regions and moments."
    }
  },
  postsofsweden: {
    storeKey: "postsofsweden",
    storeName: "PostsofSweden",
    countryFocus: "Sweden",
    defaultCurrency: "SEK",
    homepage: {
      heroTitle: "Posters inspired by Sweden",
      heroSubtitle: "Nordic places, seasons and quiet moments — printed for your home."
    },
    regions: ["Stockholm","Västra Götaland","Skåne","Jämtland","Gotland","Dalarna","Lapland"],
    cities: ["Stockholm","Göteborg","Malmö","Östersund","Visby","Uppsala","Kiruna"]
  }
};
