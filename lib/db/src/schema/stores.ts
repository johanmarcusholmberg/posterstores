import { pgTable, text, serial, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key").notNull().unique(),
  name: text("name").notNull(),
  countryFocus: text("country_focus").notNull(),
  defaultCurrency: text("default_currency").notNull(),
  defaultLanguage: text("default_language").notNull().default("en"),
  active: boolean("active").notNull().default(true),
  themeConfig: jsonb("theme_config"),
  homepageConfig: jsonb("homepage_config"),
  seoConfig: jsonb("seo_config"),
  navigationConfig: jsonb("navigation_config"),
  homepageVisualConfig: jsonb("homepage_visual_config"),
  primaryDomain: text("primary_domain"),
  domainAliases: jsonb("domain_aliases").$type<string[]>(),
  routePrefix: text("route_prefix"),
  typographyConfig: jsonb("typography_config"),
  logoUrl: text("logo_url"),
  logoStoragePath: text("logo_storage_path"),
  logoAltText: text("logo_alt_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
