# Overview

This project is a pnpm monorepo TypeScript webstore platform designed to support multiple storefronts. The primary active storefront is "PostsofSpain", with the architecture built to easily accommodate future storefronts like "PostsofSweden" or "PostsofItaly through a flexible configuration layer. The platform features robust API services, a multi-store system, a comprehensive poster slug system for SEO, an admin interface for managing stores, posters, mockups, and orders, and user authentication with favorite poster functionality. The overall vision is to create a scalable e-commerce solution for poster sales.

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

## Poster Management
A slug system is implemented for posters, providing SEO-friendly URLs (`/posters/:slug`). Slugs are auto-generated from titles, editable, and unique per store. Posters have a `status` field (`draft`, `published`, `archived`) controlling their visibility on the public storefront.

## API Endpoints
The API server provides comprehensive endpoints for:
- **Posters:** Listing, retrieving by slug or ID (published only for public), and admin-specific management (create, update, delete, view all statuses).
- **Cart:** Anonymous session-based cart management (add, update, remove items).
- **Favorites:** Both anonymous (session-based) and authenticated user-specific favorites.
- **Orders:** Creation of order drafts, retrieval, and admin management of order statuses.
- **Newsletter:** Subscription functionality.
- **Store Configuration:** Public endpoints to retrieve store configurations and admin endpoints for store management.
- **Mockup Templates:** CRUD operations for mockup templates (admin only) and listing available templates (public).
- **Poster Mockups:** Associating mockups with posters, setting primary mockups, and batch updates (admin only).

## User Authentication
- **Registration/Login:** Email and password-based authentication with `httpOnly` cookies for session management.
- **Session:** UUID-based tokens stored in `user_sessions` table for invalidatable sessions.
- **Password Hashing:** bcryptjs (12 salt rounds).
- **Favorites:** Authenticated users can save favorites, distinct from anonymous favorites.

## Admin System
A comprehensive admin interface (`/admin`) is provided for managing various aspects of the platform:
- **Authentication:** Token-gated access with an `admin_token` stored in `localStorage`.
- **Store Selection:** Admins can select an active store, influencing data displayed and managed.
- **Management:** Dedicated sections for managing posters, mockup templates, individual poster mockups, orders, and stores.
- **API Access:** Admin API calls require an `X-Admin-Token` header.

## Mockup System
- **Data Model:** `mockup_templates` (global or store-specific) and `poster_mockups` (linking posters to templates with `mockupImageUrl` and `isPrimary` flag).
- **Seeding:** 10 global mockup templates are seeded automatically.
- **Image Resolution:** Priority for displaying images on the storefront is: primary `poster_mockup.mockupImageUrl` > primary `mockup_template.previewThumbnailUrl` > `poster.imageUrl` > generic placeholder.

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