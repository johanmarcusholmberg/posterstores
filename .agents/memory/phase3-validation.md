---
name: Phase 3 Mockup Template Validation
description: Key decisions and constraints for the Phase 3 validation service, compositor dimension enforcement, sync template cache, and preview routes.
---

# Phase 3 — Validation Service & Preview Routes

## Validation service (`mockupTemplateValidation.ts`)

- `validateMockupTemplate(template)` is read-only — no DB calls, no uploads.
- Uses `fetchImageBuffer` (exported from `mockupCompositor.ts`) with a `VALIDATION_MAX_IMAGE_BYTES = 50MB` cap.
- Image inspection uses `sharp().stats()` on the alpha channel to detect truly-opaque images (alpha.min ≥ 254).
- Dimension checks always compare against **raw base dimensions**, not scaled canvas dimensions.
- `RECOMMENDED_BASE_MIN_SHORT_SIDE = 1200` — below this is a WARNING, never an error.
- Foreground fully-opaque = **error**; Effects overlay fully-opaque = **warning** (intentional full-image blend is allowed).
- `readyForSync = previewable` in Phase 3 (no persistent render fingerprint yet; Phase 4 will add that).

**Why:** Validation must be read-only so it can safely run before sync and in route handlers without side effects.

## Compositor dimension enforcement (`mockupCompositor.ts`)

- `fetchImageBuffer(url, maxBytes?)` is now **exported**.
- `fetchAndPrepareOverlay` now accepts `rawBaseW, rawBaseH, layerName` params and **rejects** mismatched overlays instead of silently resizing.
- Check: `overlay.width === rawBaseW && overlay.height === rawBaseH`. If not, throws a descriptive error.
- After the check, `fit: "fill"` resize to canvas dimensions (W, H) is still performed — safe because canvas is a proportional scale of raw dimensions.

**Why:** Silent stretching was masking dimension configuration errors, causing distorted mockups with no feedback.

## Sync route template caching (`mockupSync.ts`)

- Before the main render loop, `validateMockupTemplate` runs **once per unique template** via `Promise.all`.
- Templates that fail validation → `templateFailedRows` → DB status updated immediately (same safe-replace rules: previous image → `status=generated`; no previous image → `status=failed`).
- Templates that pass → `renderableRows` → proceed with render as before.
- `dryRun=true` skips template validation caching entirely (reports all as dry-run generated).

**Why:** Avoids re-downloading template images N times for N posters; surfaces configuration errors early.

## Preview routes (`mockupValidation.ts`)

- `POST /api/admin/mockup-templates/:id/validate` — validates saved template (no mutation).
- `POST /api/admin/mockup-templates/validate-draft` — validates raw field body (no save).
- `POST /api/admin/mockup-templates/:id/preview` — renders preview JPEG:
  - Validates template first; returns 400 if not previewable.
  - Calls `renderMockup` (same as production sync).
  - Uploads to **deterministic path** `mockup-previews/{templateId}/latest.jpg` (overwrites previous preview; no cleanup needed).
  - Does NOT write to `poster_mockups`.
  - Returns `{ previewUrl, validation, width, height }` (width/height from `sharp().metadata()` on the JPEG buffer).

## Admin poster search

- `GET /api/admin/posters/search?storeKey=X&q=Y&limit=N` added to `posters.ts`.
- Returns `{ id, title, slug, imageUrl, previewImageUrl }` (postersTable has `previewImageUrl`, NOT `thumbnailUrl`).

## MockupTemplateForm.tsx UI

- New "Template readiness" collapsible section: validate button, issue list (severity-colored), image metadata, surface info, and a status badge (Draft / Needs attention / Ready for sync).
- New "Exact preview" collapsible section: poster search + thumbnail selector, "Generate preview" button (requires isEdit), server-rendered JPEG display.
- Uses `adminValidateMockupTemplateDraft` when creating (!isEdit), `adminValidateMockupTemplate(id)` when editing.

## Test limitations (same as Phase 2.1)

- `vi.spyOn(db, 'update')` intercepts the call and captures the reason string, but `mockDeleteObject` call cannot be verified because `uploadedObjectPath` is null in the catch block within this test harness. DB-failure tests check observable behavior (reason, action, status) only.
- `vi.mock("../lib/objectStorage")` mock may not intercept when real storage credentials are present (test env has `DEFAULT_OBJECT_STORAGE_BUCKET_ID`). Preview path assertions use `res.body.previewUrl` pattern instead of `mockUploadBuffer.toHaveBeenCalledOnce()`.
