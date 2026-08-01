-- Phase 2.1 — Mockup fit-mode normalization
-- Idempotent migration: normalizes legacy and invalid fit_mode values.
-- Safe to run multiple times.

-- ── mockup_templates: top-level fit_mode ──────────────────────────────────────
-- Normalize any NULL or unrecognized value (e.g. 'stretch') to 'contain'.
UPDATE mockup_templates
SET fit_mode = 'contain'
WHERE fit_mode IS NULL
   OR fit_mode NOT IN ('cover', 'contain');

-- ── mockup_templates: nested fitMode inside placement_config JSON ─────────────
-- When placement_config is a JSON object and its fitMode key is missing or
-- holds a value other than 'cover'/'contain', normalize it to 'contain'.
UPDATE mockup_templates
SET placement_config =
  jsonb_set(placement_config, '{fitMode}', '"contain"'::jsonb, true)
WHERE placement_config IS NOT NULL
  AND jsonb_typeof(placement_config) = 'object'
  AND (
    placement_config->>'fitMode' IS NULL
    OR placement_config->>'fitMode' NOT IN ('cover', 'contain')
  );
