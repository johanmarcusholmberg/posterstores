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
  // Intended use flags
  canBePrimary: boolean("can_be_primary").default(true).notNull(),
  canBeHover: boolean("can_be_hover").default(false).notNull(),
  canBeGallery: boolean("can_be_gallery").default(true).notNull(),
  // Placement
  posterX: real("poster_x"),
  posterY: real("poster_y"),
  posterWidth: real("poster_width"),
  posterHeight: real("poster_height"),
  rotation: real("rotation"),
  borderRadius: real("border_radius"),
  shadowStrength: real("shadow_strength"),
  fitMode: text("fit_mode").default("cover"),
  // Compositing settings
  shadowEnabled: boolean("shadow_enabled").default(true),
  shadowOpacity: real("shadow_opacity").default(0.4),
  shadowBlur: real("shadow_blur").default(20),
  shadowOffsetX: real("shadow_offset_x").default(2),
  shadowOffsetY: real("shadow_offset_y").default(6),
  innerShadowEnabled: boolean("inner_shadow_enabled").default(true),
  innerShadowOpacity: real("inner_shadow_opacity").default(0.25),
  brightness: real("brightness").default(0.94),
  contrast: real("contrast").default(0.97),
  saturation: real("saturation").default(0.92),
  compositeBlur: real("composite_blur").default(0),
  // AI detection metadata (legacy per-session fields)
  detectionConfidence: real("detection_confidence"),
  detectionDescription: text("detection_description"),
  detectionSource: text("detection_source"),
  detectionModel: text("detection_model"),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  placementWasManuallyAdjusted: boolean("placement_was_manually_adjusted").default(false),
  sourceImageWidth: integer("source_image_width"),
  sourceImageHeight: integer("source_image_height"),
  // Smart placement fields
  placementMode: text("placement_mode").default("manual").notNull(),
  detectedPlacementConfig: jsonb("detected_placement_config"),
  /** Admin-defined manual surface (corners or bbox). Separate from AI detection. */
  placementConfig: jsonb("placement_config"),
  detectedPlacementStatus: text("detected_placement_status").default("not_analyzed").notNull(),
  detectedPlacementError: text("detected_placement_error"),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  // AI render mode fields
  renderMode: text("render_mode").default("deterministic").notNull(),
  aiRenderPrompt: text("ai_render_prompt"),
  aiRenderRequiresReview: boolean("ai_render_requires_review").default(true).notNull(),
  // Layered image fields
  lightingOverlayUrl: text("lighting_overlay_url"),
  foregroundImageUrl: text("foreground_image_url"),
  defaultLightingBlendMode: text("default_lighting_blend_mode").default("multiply").notNull(),
  defaultLightingOpacity: real("default_lighting_opacity").default(0.8).notNull(),
  defaultForegroundOpacity: real("default_foreground_opacity").default(1.0).notNull(),
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
  isHoverMockup: boolean("is_hover_mockup").default(false).notNull(),
  isGallery: boolean("is_gallery").default(true).notNull(),
  // Sync status tracking
  status: text("status").default("manual").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  // AI render mode tracking
  renderMode: text("render_mode").default("deterministic").notNull(),
  needsReview: boolean("needs_review").default(false).notNull(),
  aiRenderWarning: text("ai_render_warning"),
  sourcePosterImageUrl: text("source_poster_image_url"),
  sourceTemplateImageUrl: text("source_template_image_url"),
  approvedForPublic: boolean("approved_for_public").default(false).notNull(),
  // Per-assignment layer toggles
  useBase: boolean("use_base").default(true).notNull(),
  useLightingOverlay: boolean("use_lighting_overlay").default(true).notNull(),
  useForeground: boolean("use_foreground").default(true).notNull(),
  lightingOpacityOverride: real("lighting_opacity_override"),
  foregroundOpacityOverride: real("foreground_opacity_override"),
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
