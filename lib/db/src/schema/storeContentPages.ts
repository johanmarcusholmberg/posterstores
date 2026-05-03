import { pgTable, text, serial, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PAGE_KEYS = ["about", "shipping", "returns", "privacy", "terms", "contact"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const storeContentPagesTable = pgTable(
  "store_content_pages",
  {
    id: serial("id").primaryKey(),
    storeKey: text("store_key").notNull(),
    pageKey: text("page_key").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    content: text("content").notNull(),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    storePageUnique: unique("store_content_pages_store_key_page_key_unique").on(
      table.storeKey,
      table.pageKey
    ),
  })
);

export const insertStoreContentPageSchema = createInsertSchema(storeContentPagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStoreContentPage = z.infer<typeof insertStoreContentPageSchema>;
export type StoreContentPage = typeof storeContentPagesTable.$inferSelect;
