---
name: Drizzle timestamp column coercion
description: Passing ISO date strings to Drizzle timestamp columns causes runtime errors that surface as unhandled 500s.
---

When a route receives a JSON body with a date field (e.g. `detectedAt: "2024-05-21T10:00:00.000Z"`), Drizzle's pg-core `timestamp` column type calls `.toISOString()` on the value internally. Strings don't have that method, so it throws `TypeError: val.toISOString is not a function`.

**Why:** Drizzle's TypeScript type is `Date`, but `express.json()` deserialises JSON dates as strings. The mismatch is invisible at compile time when using `as any` casts.

**How to apply:** In any route that accepts timestamp fields from a request body, explicitly coerce them with `new Date(val)` before passing to Drizzle. Always wrap route handlers in try/catch so a missed coercion returns a useful 400/500 rather than a generic crash. Applied to PUT /api/mockup-templates/:id — see `coerceDate()` helper in `artifacts/api-server/src/routes/mockups.ts`.
