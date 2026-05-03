import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const POSTSOFSPAIN_STORE_KEY = "postsofspain";

const POSTSOFSPAIN_SEED = {
  storeKey: POSTSOFSPAIN_STORE_KEY,
  name: "PostersofSpain",
  countryFocus: "Spain",
  defaultCurrency: "EUR",
  defaultLanguage: "en",
  active: true,
  themeConfig: {
    background: "#FAF6EF",
    surface: "#FFFFFF",
    sand: "#E8D8C3",
    primary: "#2F80A8",
    secondary: "#C86B4A",
    text: "#1F2A33",
    muted: "#8A9A5B",
    border: "#E4DDD3",
  },
  homepageConfig: {
    heroTitle: "Posters inspired by Spain",
    heroSubtitle:
      "Mediterranean places, colors and moments — printed for your home.",
    primaryCta: "Browse posters",
    secondaryCta: "Explore regions",
    newsletterTitle: "Get new Spanish poster releases in your inbox",
    newsletterSubtitle:
      "Be the first to see new collections, city drops and seasonal releases.",
    regions: [
      "Valencia",
      "Andalusia",
      "Catalonia",
      "Madrid",
      "Balearic Islands",
      "Basque Country",
      "Galicia",
      "Canary Islands",
    ],
    cities: [
      "Valencia",
      "Barcelona",
      "Madrid",
      "Sevilla",
      "Málaga",
      "Alicante",
      "Granada",
      "Bilbao",
      "Cádiz",
      "Palma",
    ],
    categories: [
      "Spanish Cities",
      "Coastal Posters",
      "Food & Drinks",
      "Architecture",
      "Botanical",
      "Travel Posters",
      "Minimal Posters",
      "Vintage Posters",
      "Café Posters",
    ],
    tags: [
      "Mediterranean",
      "Café",
      "Orange",
      "Architecture",
      "Beach",
      "Summer",
      "Kitchen",
      "Gallery wall",
      "Botanical",
      "Vintage",
      "Minimal",
      "Terracotta",
      "Blue",
      "Coastal",
    ],
  },
  seoConfig: {
    defaultTitle: "PostersofSpain — Art Posters of Spain",
    defaultDescription:
      "Discover beautifully printed posters inspired by Spanish cities, regions and moments.",
  },
  navigationConfig: null,
  primaryDomain: null,
  domainAliases: null,
  routePrefix: null,
} as const;

/**
 * Safely creates the PostsofSpain store record from the canonical static
 * config if it does not already exist in the database.
 *
 * - Never overwrites an existing record (even if partially configured).
 * - Safe to call on every startup; idempotent.
 */
export async function seedPostsofSpain(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.storeKey, POSTSOFSPAIN_STORE_KEY))
      .limit(1);

    if (existing) {
      logger.debug(
        { storeKey: POSTSOFSPAIN_STORE_KEY },
        "PostsofSpain store already exists in DB — skipping seed"
      );
      return;
    }

    const now = new Date();
    await db.insert(storesTable).values({
      ...POSTSOFSPAIN_SEED,
      createdAt: now,
      updatedAt: now,
    });

    logger.info(
      { storeKey: POSTSOFSPAIN_STORE_KEY },
      "PostsofSpain store record created from static config"
    );
  } catch (err) {
    logger.error(
      { err, storeKey: POSTSOFSPAIN_STORE_KEY },
      "Failed to seed PostsofSpain store — startup continues"
    );
  }
}
