import { pgTable, text, serial, boolean, timestamp, integer, jsonb, real } from "drizzle-orm/pg-core";
import { postersTable } from "./posters";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const MOCKUP_CATEGORIES = [
  "Wall",
  "Interior",
  "Café/Table",
  "Frame",
  "Lifestyle",
  "Minimal",
  "Decorative",
] as const;

export const MOCKUP_FRAME_MATERIALS = [
  "black",
  "white",
  "light-wood",
  "dark-wood",
  "oak",
  "none",
  "mixed",
] as const;

export const MOCKUP_ORIENTATIONS = ["portrait", "landscape", "square", "any"] as const;

export const MOCKUP_SUPPORTED_FORMATS = [
  "30x40",
  "50x50",
  "50x70",
  "A4",
  "A3",
  "A2",
] as const;

export const mockupTemplatesTable = pgTable("mockup_templates", {
  id: serial("id").primaryKey(),
  storeKey: text("store_key"),
  name: text("name").notNull(),
  description: text("description"),
  templateKey: text("template_key").notNull(),
  backgroundImageUrl: text("background_image_url"),
  storagePath: text("storage_path"),
  frameType: text("frame_type").notNull().default("none"),
  category: text("category"),
  orientation: text("orientation"),
  supportedFormats: jsonb("supported_formats").$type<string[]>(),
  supportedOrientation: text("supported_orientation"),
  supportedAspectRatio: text("supported_aspect_ratio"),
  previewThumbnailUrl: text("preview_thumbnail_url"),
  isFeatured: boolean("is_featured").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  posterX: real("poster_x"),
  posterY: real("poster_y"),
  posterWidth: real("poster_width"),
  posterHeight: real("poster_height"),
  rotation: real("rotation"),
  borderRadius: real("border_radius"),
  shadowStrength: real("shadow_strength"),
  detectionConfidence: real("detection_confidence"),
  detectionDescription: text("detection_description"),
  detectionSource: text("detection_source"),
  detectionModel: text("detection_model"),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  placementWasManuallyAdjusted: boolean("placement_was_manually_adjusted").default(false),
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
