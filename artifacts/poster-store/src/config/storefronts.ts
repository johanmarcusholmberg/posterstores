export interface StorefrontConfig {
  storeKey: string;
  storeName: string;
  countryFocus: string;
  defaultCurrency: string;
  defaultLanguage?: string;
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
  };
  regions: string[];
  cities: string[];
  categories?: string[];
  tags?: string[];
  seo?: {
    defaultTitle: string;
    defaultDescription: string;
  };
}

export const storefronts: Record<string, StorefrontConfig> = {
  postsofspain: {
    storeKey: "postsofspain",
    storeName: "PostsofSpain",
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
    regions: ["Valencia","Andalusia","Catalonia","Madrid","Balearic Islands","Basque Country","Galicia","Canary Islands"],
    cities: ["Valencia","Barcelona","Madrid","Sevilla","Málaga","Alicante","Granada","Bilbao","Cádiz","Palma"],
    categories: ["Spanish Cities","Coastal Posters","Food & Drinks","Architecture","Botanical","Travel Posters","Minimal Posters","Vintage Posters","Café Posters"],
    tags: ["Mediterranean","Café","Orange","Architecture","Beach","Summer","Kitchen","Gallery wall","Botanical","Vintage","Minimal","Terracotta","Blue","Coastal"],
    seo: {
      defaultTitle: "PostsofSpain — Art Posters of Spain",
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
