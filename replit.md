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
- **`lib/db`** — Drizzle ORM schema + client (posters, cart_items, favorites, orders, newsletter_subscriptions)
- **`lib/api-spec`** — OpenAPI spec + orval codegen config
- **`lib/api-zod`** — Zod schemas generated from OpenAPI spec (index.ts must stay as `export * from "./generated/api"` only)
- **`lib/api-client-react`** — TanStack Query hooks generated from OpenAPI spec

### Multi-Store System
- `artifacts/poster-store/src/config/storefronts.ts` — StorefrontConfig interface and all storefront definitions
- `artifacts/poster-store/src/config/activeStore.ts` — ACTIVE_STORE_KEY = "postsofspain"
- `artifacts/poster-store/src/context/StorefrontContext.tsx` — React context providing active store config

### API Endpoints
- `GET /api/posters` — list posters (storeKey, region, city, category, tag, search, sort, limit, offset)
- `GET /api/posters/:id` — single poster
- `GET /api/stats/featured` — featured posters array (NOT wrapped in object)
- `GET /api/stats/new-arrivals` — new arrivals array (NOT wrapped in object)
- `GET /api/cart` — cart by sessionId (returns `{sessionId, items, total, itemCount}`)
- `POST /api/cart` — add cart item
- `PUT /api/cart/:cartItemId` — update quantity
- `DELETE /api/cart/:cartItemId` — remove item
- `GET /api/favorites` — favorites by sessionId (returns plain array of posters, NOT `{posters:[]}`)
- `POST /api/favorites` — add favorite
- `DELETE /api/favorites/:posterId` — remove favorite
- `POST /api/orders` — create order
- `GET /api/orders/:id` — get order
- `POST /api/newsletter` — subscribe

### Session Management
- Sessions use a UUID stored in `localStorage` as `session_id` (no auth required)
- `artifacts/poster-store/src/lib/session.ts` — `getSessionId()` generates/retrieves the UUID

### Database
- 12 posters seeded for postsofspain storeKey
- Schema: `lib/db/src/schema/`

## Important Notes

- The `/api/stats/featured` and `/api/stats/new-arrivals` endpoints return **plain arrays**, not wrapped objects
- The `/api/favorites` endpoint returns a **plain array** of poster objects, not `{posters: []}`
- The `/api/posters` (list) endpoint returns `{posters, total, offset, limit}`
- The `/api/cart` endpoint returns `{sessionId, items, total, itemCount}` where items may include nested `poster` object
- vite dedupe config includes `react`, `react-dom`, and `@tanstack/react-query` to prevent duplicate instances
- After running codegen, `lib/api-zod/src/index.ts` must be kept as a single line: `export * from "./generated/api"`
