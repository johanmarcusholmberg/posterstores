# Overview

This project is a pnpm monorepo TypeScript webstore platform designed to support multiple storefronts. The primary active storefront is "PostersofSpain", with the architecture built to easily accommodate future storefronts like "PostsofSweden" or "PostsofItaly through a flexible configuration layer. The platform features robust API services, a multi-store system, a comprehensive poster slug system for SEO, an admin interface for managing stores, posters, mockups, and orders, and user authentication with favorite poster functionality. The overall vision is to create a scalable e-commerce solution for poster sales.

# User Preferences

I prefer iterative development with clear explanations for any significant changes. Before making major architectural decisions or implementing new features, please discuss them with me. For code changes, I prefer a focus on maintainability and readability. I do not want any changes made to the `lib/api-zod/src/index.ts` file beyond ensuring it exports `export * from "./generated/api"`.

# System Architecture

## Core Technologies
- **Monorepo:** pnpm workspaces
- **Backend:** Node.js 24, Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Frontend:** React + Vite, wouter routing, TanStack Query, shadcn/ui
- **TypeScript:** Version 5.9
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

## Multi-Store System
The platform supports multiple storefronts configured via `artifacts/poster-store/src/config/storefronts.ts` and a `stores` table in the database. Database configurations take precedence over static configurations. Each storefront can have unique themes, homepage layouts, SEO settings, and navigation. An admin interface allows for the creation, editing, and management of these stores, including activation/deactivation.

### Domain & Route-Prefix Resolution
The `stores` table now has three routing fields:
- `primary_domain` — e.g. `postsofspain.com`
- `domain_aliases` — JSON array, e.g. `["www.postsofspain.com"]`
- `route_prefix` — e.g. `spain` (enables `/spain/shop`, `/spain/posters/:slug`, etc.)

**Active store resolver** (frontend `StorefrontContext.tsx`) runs on every page load with this priority:
1. **Route prefix** — first URL path segment matches a store's `routePrefix` (e.g. `/spain` → postsofspain)
2. **Domain mapping** — `window.location.hostname` matches a store's `primaryDomain` or `domainAliases`
3. **Env/default fallback** — `VITE_ACTIVE_STORE_KEY` env var, falling back to `postsofspain`

**Route-prefix routing** (`App.tsx`): when a prefix is resolved, public routes are served under a nested `WouterRouter` with that base path. All existing public routes (`/`, `/shop`, `/posters/:slug`, etc.) work unchanged inside the sub-router (e.g. `/spain/shop`). Admin routes are never prefixed.

**Server-side resolver endpoint**: `GET /api/stores/resolve?prefix=spain` or `GET /api/stores/resolve?domain=postsofspain.com&fallback=postsofspain` — resolves and returns the matching store object.

**Admin store form** has new "Domain & routing" section for configuring `primaryDomain`, `domainAliases`, and `routePrefix` per store with validation and uniqueness enforcement.

## Poster Management
A slug system is implemented for posters, providing SEO-friendly URLs (`/posters/:slug`). Slugs are auto-generated from titles, editable, and unique per store. Posters have a `status` field (`draft`, `published`, `archived`) controlling their visibility on the public storefront.

## API Endpoints
The API server provides comprehensive endpoints for:
- **Posters:** Listing, retrieving by slug or ID (published only for public), and admin-specific management (create, update, delete, view all statuses).
- **Cart:** Anonymous session-based cart management (add, update, remove items).
- **Favorites:** Both anonymous (session-based) and authenticated user-specific favorites.
- **Orders:** Creation of order drafts with shipping method selection, retrieval, user order history (`GET /api/user/orders` — auth required), and admin management of order statuses and fulfillment.
- **Shipping Methods:** `GET /api/shipping-methods` (public, filterable by storeKey/country) and admin CRUD at `/api/admin/shipping-methods`.
- **Newsletter:** Subscription functionality.
- **Store Configuration:** Public endpoints to retrieve store configurations and admin endpoints for store management.
- **Mockup Templates:** CRUD operations for mockup templates (admin only) and listing available templates (public).
- **Poster Mockups:** Associating mockups with posters, setting primary mockups, and batch updates (admin only).

## Shipping System
A `shipping_methods` table stores available shipping options per store. The migration (`migrateShipping`) runs at server startup and:
- Creates the `shipping_methods` table if not present
- Adds `customer_phone`, `selected_shipping_method_id`, `selected_shipping_method_name`, `selected_shipping_method_courier`, `selected_shipping_method_estimate` columns to the `orders` table
- Seeds two default methods for postsofspain: Standard Shipping (€4.95, 5-10 days) and Express Shipping (€9.95, 2-4 days)

When an order is created, the selected shipping method's price is included in the total and Stripe line items.

## Checkout Flow
Multi-step checkout (Details → Shipping → Payment):
1. **Details**: Contact info (email + optional phone) and full shipping address
2. **Shipping**: Select from available shipping methods loaded from `/api/shipping-methods`
3. **Payment**: Review summary and redirect to Stripe Checkout

Order creation uses direct `fetch` (not generated client) to pass `shippingMethodId` and `customerPhone` fields not yet in the OpenAPI spec.

## Account / Order History
The Account page (`/account`) shows:
- User email and quick actions (Saved posters, Log out)
- Order history section fetching from `GET /api/user/orders` (requires auth cookie)
- Expandable order cards showing items, shipping method, tracking, price breakdown

## User Authentication
- **Registration/Login:** Email and password-based authentication with `httpOnly` cookies for session management.
- **Session:** UUID-based tokens stored in `user_sessions` table for invalidatable sessions.
- **Password Hashing:** bcryptjs (12 salt rounds).
- **Favorites:** Authenticated users can save favorites, distinct from anonymous favorites.

## Admin System
A comprehensive admin interface (`/admin`) is provided for managing various aspects of the platform:
- **Authentication:** Token-gated access with an `admin_token` stored in `localStorage`.
- **Store Selection:** Admins can select an active store, influencing data displayed and managed.
- **Management:** Dedicated sections for managing posters, mockup templates, individual poster mockups, orders, stores, and content pages.
- **API Access:** Admin API calls require an `X-Admin-Token` header.

## Store Content Pages
Each store can have editable content for six public pages: About, Shipping, Returns, Privacy, Terms, and Contact.

- **Data Model:** `store_content_pages` table with `store_key + page_key` unique constraint. Fields: `id`, `store_key`, `page_key`, `title`, `subtitle`, `content`, `meta_title`, `meta_description`, `published`, `created_at`, `updated_at`.
- **Admin API:** `GET /api/admin/content?storeKey=`, `GET /api/admin/content/:pageKey?storeKey=`, `PUT /api/admin/content/:pageKey?storeKey=` (all require `X-Admin-Token`).
- **Public API:** `GET /api/content/:pageKey?storeKey=` — only returns published content rows.
- **Fallback behavior:** If no published content row exists for a store + pageKey, the public page renders its built-in default placeholder copy.
- **Store scoping:** Each store's content is fully independent; PostsofSpain and PostsofSweden can have different text.
- **Admin UI:** `/admin/content` (list all 6 pages) and `/admin/content/:pageKey` (edit form with title, subtitle, textarea, SEO fields, published toggle).
- **Launch checklist:** The "Legal / store pages" section now checks whether each page has a published content row, warning if only fallback copy is in use.

## Mockup System
- **Data Model:** `mockup_templates` (global or store-specific) and `poster_mockups` (linking posters to templates with `mockupImageUrl` and `isPrimary` flag).
- **Seeding:** 10 global mockup templates are seeded automatically on first run.
- **Image Resolution:** Priority for displaying images on the storefront is: primary `poster_mockup.mockupImageUrl` > primary `mockup_template.previewThumbnailUrl` > `poster.imageUrl` > generic placeholder.
- **Extended template fields:** `category`, `orientation`, `supportedFormats` (jsonb), `storagePath`, `isFeatured`, `posterX/Y/Width/Height`, `rotation`, `borderRadius`, `shadowStrength`.
- **Compositing:** When a template has placement data (posterX/Y/Width/Height set), the public `MockupGallery` overlays the poster image on the background using CSS absolute positioning. This enables runtime composite previews without pre-rendering.
- **Admin Template Management:** Full CRUD UI at `/admin/mockups` — admins can upload background images to object storage, define poster placement areas as % of image size, set category/frame/orientation/format filters, toggle featured/active, and scope templates as global or store-specific.
- **File Upload:** Admin template form uploads images directly to Replit Object Storage via presigned URLs (`POST /api/storage/uploads/request-url` → PUT to GCS presigned URL). Images are served at `/api/storage/objects/*`.
- **Object Storage:** Replit object storage is provisioned (`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` env vars). Storage routes are at `/api/storage/uploads/request-url` (POST), `/api/storage/public-objects/*` (GET), `/api/storage/objects/*` (GET). `lib/object-storage-web` is the client-side library (composite lib with `composite: true`).

# External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Drizzle ORM:** Used for database interactions.
- **Express:** Web application framework for the API server.
- **React:** Frontend library for building user interfaces.
- **Vite:** Frontend build tool.
- **wouter:** Small routing library for the frontend.
- **TanStack Query:** Data fetching and caching library for React.
- **shadcn/ui:** UI component library.
- **Zod:** Schema declaration and validation library.
- **Orval:** OpenAPI client code generator.
- **bcryptjs:** Library for hashing passwords.