import { pgTable, text, serial, numeric, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postersTable = pgTable("posters", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key").notNull().default("postsofspain"),
  slug: text("slug"),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  masterPrintImageUrl: text("master_print_image_url"),
  previewImageUrl: text("preview_image_url"),
  region: text("region"),
  city: text("city"),
  category: text("category").notNull(),
  tags: text("tags").array(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  sizes: text("sizes").array(),
  displayTitle: text("display_title"),
  isFeatured: boolean("is_featured").default(false),
  isNew: boolean("is_new").default(false),
  isCollectionBanner: boolean("is_collection_banner").default(false),
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPosterSchema = createInsertSchema(postersTable).omit({ id: true, createdAt: true });
export type InsertPoster = z.infer<typeof insertPosterSchema>;
export type Poster = typeof postersTable.$inferSelect;
