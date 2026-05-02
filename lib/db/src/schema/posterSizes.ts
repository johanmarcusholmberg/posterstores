import { pgTable, text, serial, numeric, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postersTable } from "./posters";

export const posterSizesTable = pgTable("poster_sizes", {
  id: serial("id").primaryKey(),
  posterId: integer("poster_id")
    .notNull()
    .references(() => postersTable.id, { onDelete: "cascade" }),
  sizeLabel: text("size_label").notNull(),
  widthCm: numeric("width_cm", { precision: 8, scale: 2 }),
  heightCm: numeric("height_cm", { precision: 8, scale: 2 }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPosterSizeSchema = createInsertSchema(posterSizesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPosterSize = z.infer<typeof insertPosterSizeSchema>;
export type PosterSize = typeof posterSizesTable.$inferSelect;
