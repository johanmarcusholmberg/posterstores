-- Phase 2 — Simplify mockup admin
-- Idempotent migration: drops removed columns and updates column defaults.
-- Safe to run multiple times.

-- ── mockup_templates ─────────────────────────────────────────────────────────
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS shadow_strength;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS shadow_enabled;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS shadow_opacity;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS shadow_blur;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS shadow_offset_x;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS shadow_offset_y;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS inner_shadow_enabled;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS inner_shadow_opacity;
ALTER TABLE mockup_templates DROP COLUMN IF EXISTS composite_blur;

-- Update defaults so new rows get neutral values
ALTER TABLE mockup_templates ALTER COLUMN brightness SET DEFAULT 1.0;
ALTER TABLE mockup_templates ALTER COLUMN contrast  SET DEFAULT 1.0;
ALTER TABLE mockup_templates ALTER COLUMN saturation SET DEFAULT 1.0;
ALTER TABLE mockup_templates ALTER COLUMN fit_mode   SET DEFAULT 'contain';

-- ── poster_mockups ────────────────────────────────────────────────────────────
ALTER TABLE poster_mockups DROP COLUMN IF EXISTS use_base;
ALTER TABLE poster_mockups DROP COLUMN IF EXISTS use_lighting_overlay;
ALTER TABLE poster_mockups DROP COLUMN IF EXISTS use_foreground;
ALTER TABLE poster_mockups DROP COLUMN IF EXISTS lighting_opacity_override;
ALTER TABLE poster_mockups DROP COLUMN IF EXISTS foreground_opacity_override;
