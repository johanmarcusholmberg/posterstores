import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { postersTable } from "./posters";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mockupTemplatesTable = pgTable("mockup_templates", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key"),
  name: text("name").notNull(),
  description: text("description"),
  templateKey: text("template_key").notNull(),
  backgroundImageUrl: text("background_image_url"),
  frameType: text("frame_type").notNull().default("none"),
  supportedOrientation: text("supported_orientation"),
  supportedAspectRatio: text("supported_aspect_ratio"),
  previewThumbnailUrl: text("preview_thumbnail_url"),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const posterMockupsTable = pgTable("poster_mockups", {
  id: serial("id").primaryKey(),
  posterId: integer("poster_id")
    .notNull()
    .references(() => postersTable.id, { onDelete: "cascade" }),
  mockupTemplateId: integer("mockup_template_id").references(
    () => mockupTemplatesTable.id,
    { onDelete: "set null" }
  ),
  mockupImageUrl: text("mockup_image_url"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMockupTemplateSchema = createInsertSchema(
  mockupTemplatesTable
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertPosterMockupSchema = createInsertSchema(
  posterMockupsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export type MockupTemplate = typeof mockupTemplatesTable.$inferSelect;
export type PosterMockup = typeof posterMockupsTable.$inferSelect;
export type InsertMockupTemplate = z.infer<typeof insertMockupTemplateSchema>;
export type InsertPosterMockup = z.infer<typeof insertPosterMockupSchema>;
