# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Multi-store poster webstore platform — PostsofSpain is the active storefront. Architecture supports future storefronts (PostsofSweden, PostsofItaly, etc.) via a storefront config layer.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, wouter routing, TanStack Query, shadcn/ui

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Architecture

### Artifacts
- **`artifacts/poster-store`** — React+Vite storefront (preview path `/`, port from `$PORT`)
- **`artifacts/api-server`** — Express 5 API server (preview path `/api`, port 8080)

### Shared Libraries
- **`lib/db`** — Drizzle ORM schema + client (posters, cart_items, favorites, orders, newsletter_subscriptions, mockup_templates, poster_mockups)
- **`lib/api-spec`** — OpenAPI spec + orval codegen config
- **`lib/api-zod`** — Zod schemas generated from OpenAPI spec (index.ts must stay as `export * from "./generated/api"` only)
- **`lib/api-client-react`** — TanStack Query hooks generated from OpenAPI spec

### Multi-Store System
- `artifacts/poster-store/src/config/storefronts.ts` — StorefrontConfig interface and all storefront definitions (static fallback)
- `artifacts/poster-store/src/config/activeStore.ts` — ACTIVE_STORE_KEY = "postsofspain"
- `artifacts/poster-store/src/context/StorefrontContext.tsx` — React context: starts with static config, then fetches from DB via `GET /api/stores/:storeKey/config` and updates if found
- `lib/db/src/schema/stores.ts` — `stores` table (id, store_key, name, country_focus, default_currency, default_language, active, theme_config jsonb, homepage_config jsonb, seo_config jsonb, navigation_config jsonb, created_at, updated_at)

#### Admin Store Management
- **Routes**: `/admin/stores`, `/admin/stores/new`, `/admin/stores/:storeKey`
- **API**: `GET/POST /api/admin/stores`, `GET/PUT /api/admin/stores/:storeKey`, `PATCH /api/admin/stores/:storeKey/deactivate`
- **Public API**: `GET /api/stores` (active stores list), `GET /api/stores/:storeKey/config` (merged StorefrontConfig shape)
- **Config bridge**: DB stores take priority over static `storefronts.ts` config. If no DB record exists, static config is used as fallback.
- **Store selector**: `AdminStoreSelector` fetches active DB stores + merges with static fallback stores; persists selection in localStorage; accepts any store key (not just static ones)
- **Validation**: storeKey must match `/^[a-z][a-z0-9]*$/` (no hyphens/spaces), unique, required. Store name, currency, language required. Theme colors must be valid 6-digit hex values. Archive/deactivate instead of delete; blocked if store has posters or orders.
- **Components**: `AdminStoreForm` (create/edit with theme color pickers, taxonomy comma-lists, homepage copy, SEO fields), `AdminStores` (list page), `AdminStoreNew`, `AdminStoreEdit`
- **Domain routing**: Architecture is prepared but not yet implemented. Resolver priority: explicit domain → ACTIVE_STORE_KEY env → postsofspain fallback.

### Poster Slug System
- `slug` column added to `posters` table (text, nullable, unique per store_key)
- Unique constraint: `posters_store_key_slug_unique` on `(store_key, slug) WHERE slug IS NOT NULL`
- Migration runs on API startup via `migrateSlugField()` — adds column + index if missing, then generates slugs for any poster that lacks one
- Slug generation: lowercase, NFD-normalized (strips diacritics), strips non-alphanumeric, spaces → dashes, deduped with `-2`, `-3` suffix per store
- Admin form: auto-generates slug from title (live), allows manual edit, shows regenerate button, validates format + uniqueness
- Public URLs: `/posters/:slug` → `PosterBySlug.tsx` (published only, store-scoped 404 if draft or wrong store)
- Backward compat: `/poster/:id` → `PosterDetail.tsx` still works
- PosterCard links to `/posters/:slug` when slug present, falls back to `/poster/:id`
- SEO basics: `PosterBySlug` sets `document.title` and `meta[name=description]` on load
- API: `GET /api/posters/by-slug/:slug?storeKey=` — public, published only

### API Endpoints
- `GET /api/posters` — list posters (storeKey, region, city, category, tag, search, sort, limit, offset)
- `GET /api/posters/by-slug/:slug?storeKey=` — single poster by slug (published only, store-scoped)
- `GET /api/posters/:id` — single poster by ID (backward compat)
- `GET /api/stats/featured` — featured posters array (NOT wrapped in object)
- `GET /api/stats/new-arrivals` — new arrivals array (NOT wrapped in object)
- `GET /api/cart` — cart by sessionId (returns `{sessionId, items, total, itemCount}`)
- `POST /api/cart` — add cart item
- `PUT /api/cart/:cartItemId` — update quantity
- `DELETE /api/cart/:cartItemId` — remove item
- `GET /api/favorites` — favorites by sessionId (returns plain array of posters, NOT `{posters:[]}`)
- `POST /api/favorites` — add favorite
- `DELETE /api/favorites/:posterId` — remove favorite
- `POST /api/orders` — create order draft (server-side price calc, validates cart, stores snapshots, clears cart on success)
- `GET /api/orders/:id` — get order with items
- `GET /api/admin/orders` — list orders (admin; supports storeKey, status, limit, offset filters)
- `GET /api/admin/orders/:id` — get full order detail with items (admin)
- `PATCH /api/admin/orders/:id/status` — update order status (admin; valid: draft, pending_payment, paid, processing, shipped, cancelled)
- `POST /api/newsletter` — subscribe

### Mockup System API Endpoints
- `GET /api/mockup-templates?storeKey=` — list available templates (global + store-specific); public
- `POST /api/mockup-templates` — create template (admin only)
- `PUT /api/mockup-templates/:id` — update template (admin only)
- `DELETE /api/mockup-templates/:id` — delete template (admin only)
- `GET /api/posters/:id/mockups?storeKey=` — list mockups for a poster; public
- `POST /api/posters/:id/mockups?storeKey=` — add a single mockup to a poster (admin only)
- `PUT /api/posters/:id/mockups/batch?storeKey=` — replace all mockups for a poster in one call (admin only)
- `PATCH /api/posters/:id/mockups/:mockupId/primary?storeKey=` — set primary mockup (admin only)
- `DELETE /api/posters/:id/mockups/:mockupId?storeKey=` — remove a mockup (admin only)

### User Authentication
- **Registration**: POST /api/auth/register — email + password (min 6 chars), returns `{user: {id, email}}`
- **Login**: POST /api/auth/login — returns `{user: {id, email}}`, sets httpOnly cookie `auth_token` (30-day expiry)
- **Logout**: POST /api/auth/logout — clears cookie, deletes session from DB
- **Session check**: GET /api/auth/me — returns `{user}` if authenticated, 401 otherwise
- **Session storage**: UUID token stored in `user_sessions` table (not JWT) — invalidatable
- **Password hashing**: bcryptjs (salt rounds 12)
- **Cookie**: `auth_token`, httpOnly, SameSite=Lax, 30-day maxAge, secure in production
- **Middleware**: `artifacts/api-server/src/middleware/requireAuth.ts` — looks up cookie, validates session, attaches `req.user`
- **Startup migration**: `artifacts/api-server/src/lib/migrateUserAuth.ts` — creates `users`, `user_sessions` tables; adds `user_id` FK column to `favorites` if missing
- **Frontend context**: `artifacts/poster-store/src/context/AuthContext.tsx` — fetches `/api/auth/me` on mount, exposes `user`, `login`, `logout`, `register`

### User Favorites (Authenticated)
- **Routes**: `/api/user/favorites` (GET, POST, DELETE) — all require auth cookie
- **GET**: `?storeKey=postsofspain` — returns array of poster objects saved by the logged-in user
- **POST**: `{posterId, storeKey}` — adds to favorites (idempotent)
- **DELETE**: `?posterId=X&storeKey=postsofspain` — removes from favorites
- **Frontend API**: `artifacts/poster-store/src/lib/favoritesApi.ts` — raw fetch with credentials (not generated hooks)
- **PosterCard**: shows filled/empty heart; login prompt modal when guest clicks heart
- **Favorites page** (`/favorites`): shows login prompt for guests; shows saved posters with remove button when logged in

### Session Management (Legacy / Cart)
- Anonymous cart sessions use a UUID stored in `localStorage` as `session_id` (no auth required)
- `artifacts/poster-store/src/lib/session.ts` — `getSessionId()` generates/retrieves the UUID

### Admin System
- **Routes**: `/admin`, `/admin/posters`, `/admin/posters/new`, `/admin/posters/:id`, `/admin/mockups`, `/admin/posters/:id/mockups`, `/admin/orders`, `/admin/orders/:id`, `/admin/stores`, `/admin/stores/new`, `/admin/stores/:storeKey`, `/admin/fulfillment`
- **Token gate**: `AdminTokenGate` shows a login screen if no token in localStorage (`admin_token` key)
- **Token storage**: Token stored in browser `localStorage` under `admin_token` key; cleared with "Clear token" button
- **API auth**: All admin API calls send `X-Admin-Token: <token>` header via `artifacts/poster-store/src/lib/adminApi.ts` and `artifacts/poster-store/src/lib/mockupApi.ts`
- **Store selector**: Admin maintains its own active store in `localStorage` under `admin_active_store` key; now fetches DB stores (via public `/api/stores`) merged with static fallback
- **Context**: `AdminTokenContext` provides token + adminStoreKey (accepts any valid store key, not just static ones)
- **Components**: `AdminDashboardLayout`, `AdminTokenGate`, `AdminStoreSelector`, `AdminStatusBadge`, `AdminPosterList`, `AdminPosterForm`, `AdminImageFields`, `AdminSizePriceEditor`, `AdminPublishControls`, `AdminMockupTemplateList`, `AdminPosterMockupManager`, `PrimaryMockupBadge`, `AdminStoreForm`

### Admin API Behavior
- `GET /api/posters` with valid `X-Admin-Token`: pass `status=all` to see all; `status=draft` for drafts; etc.
- `GET /api/posters` without token: always filters `status=published` only
- `GET /api/posters/:id` with valid token: sees any status; without token: published only
- `POST /api/posters`, `PUT /api/posters/:id`, `DELETE /api/posters/:id`: require `X-Admin-Token` header
- All mockup mutation endpoints require `X-Admin-Token` and verify storeKey matches poster's store

### Mockup System

#### Data Model
- **`mockup_templates`**: Global or store-specific presentation templates. `storeKey = null` means global (all stores).
- **`poster_mockups`**: Join table linking posters to templates. One `isPrimary = true` per poster. Has `mockupImageUrl` for custom images.

#### Seeded Templates (10 global)
Simple white wall with black frame, Warm beige wall with oak frame, Terracotta wall with black frame, Mediterranean living room, Café table flat lay, Kitchen wall, Gallery wall, Minimal bedroom, Close-up frame detail, Size comparison wall. Seeded automatically on API server startup if no templates exist.

#### Image Resolution Priority (public storefront)
1. Primary `poster_mockup.mockupImageUrl`
2. Primary `mockup_template.previewThumbnailUrl`
3. `poster.imageUrl`
4. Generic placeholder (fallback via `onError`)

#### Key Files
- `lib/db/src/schema/mockups.ts` — Drizzle schema for mockup_templates and poster_mockups
- `artifacts/api-server/src/routes/mockups.ts` — All mockup API routes + seed logic
- `artifacts/poster-store/src/lib/mockupApi.ts` — Frontend API client for mockups
- `artifacts/poster-store/src/components/admin/AdminMockupTemplateList.tsx` — Template list with active toggle
- `artifacts/poster-store/src/components/admin/AdminPosterMockupManager.tsx` — Poster mockup assignment UI
- `artifacts/poster-store/src/components/admin/PrimaryMockupBadge.tsx` — Star badge for primary mockup
- `artifacts/poster-store/src/components/public/MockupGallery.tsx` — Public gallery with thumbnail strip
- `artifacts/poster-store/src/pages/admin/AdminMockups.tsx` — /admin/mockups page
- `artifacts/poster-store/src/pages/admin/AdminPosterMockups.tsx` — /admin/posters/:id/mockups page

### Poster Status Field
- Added `status` column (text, default `"published"`) to `posters` table
- Valid values: `draft`, `published`, `archived`
- Existing posters default to `"published"` so storefront continues working

### Database
- 12 posters seeded for postsofspain storeKey
- 10 global mockup templates seeded on API startup
- Schema: `lib/db/src/schema/` — posters, posterSizes, cart, favorites, orders, orderItems, newsletter, mockups, **stores**

## Important Notes

- The `/api/stats/featured` and `/api/stats/new-arrivals` endpoints return **plain arrays**, not wrapped objects
- The `/api/favorites` endpoint returns a **plain array** of poster objects, not `{posters: []}`
- The `/api/posters` (list) endpoint returns `{posters, total, offset, limit}`
- The `/api/cart` endpoint returns `{sessionId, items, total, itemCount}` where items may include nested `poster` object
- vite dedupe config includes `react`, `react-dom`, and `@tanstack/react-query` to prevent duplicate instances
- After running codegen, `lib/api-zod/src/index.ts` must stay as single line: `export * from "./generated/api"` (orval regenerates it with a broken api.schemas export — a stub `lib/api-zod/src/generated/api.schemas.ts` containing `export {};` prevents the typecheck error)
- Poster `status` field defaults to `"published"` — public shop only shows published posters
- Mockup endpoints outside the OpenAPI spec are called directly via `mockupApi.ts`, not via generated hooks
- `PosterCard` fetches mockup data per-card via `useEffect` — falls back gracefully if no mockups exist or the request fails
