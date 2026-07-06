# Production Deployment Checklist

## Database schema changes

**Never rely on `drizzle-kit push` (interactive or `--force`) for production.**
`push` diffs the live database against the schema and applies changes
directly — even with `--force` it can silently accept a destructive change
(e.g. truncating a table to add a constraint) with no review step and no
audit trail. It is only used in this project as a **development
convenience** (see `scripts/post-merge.sh`), never against production data.

Production schema changes must go through a reviewed **generate-then-migrate**
flow instead:

### 1. Generate a migration (in development)

After changing `lib/db/src/schema/*`, generate a SQL migration file:

```bash
pnpm --filter @workspace/db run generate
```

This writes a new, numbered SQL file to `lib/db/drizzle/migrations/`. It does
**not** touch any database.

### 2. Review and commit the migration

- Open the generated `.sql` file and read it top to bottom.
- Confirm there is no unexpected `DROP`, `TRUNCATE`, or data-loss statement.
- If Drizzle flags a destructive change (e.g. a new `NOT NULL`/`UNIQUE`
  column or constraint), add a hand-written data backfill/cleanup step in
  the same migration or a preceding one, rather than accepting silent data
  loss.
- Commit the migration file alongside the schema change that produced it.

### 3. Apply the migration to production

Run this against the **production** `DATABASE_URL` as part of your deploy
step (manually, or wired into your deployment process once you've confirmed
the migration is safe):

```bash
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm --filter @workspace/db run migrate
```

`drizzle-kit migrate` only applies migration files that haven't been run yet
(tracked in a `__drizzle_migrations` table) — it never diffs or auto-applies
uncommitted schema changes, so there's nothing left to review or approve at
deploy time; that already happened in step 2.

### Summary of `@workspace/db` scripts

| Script | Command | Use case |
|---|---|---|
| `push` | `drizzle-kit push` | Local development, prompts on risky changes |
| `push-force` | `drizzle-kit push --force` | **Dev-only** automated recovery (post-merge script). Never use in production. |
| `generate` | `drizzle-kit generate` | Create a reviewed migration file from schema changes |
| `migrate` | `drizzle-kit migrate` | Apply committed migration files — safe for production |

## Post-merge / dev recovery behavior

`scripts/post-merge.sh` runs automatically after a task merge to keep the
development environment usable. It:

- Installs dependencies (`pnpm install --frozen-lockfile`)
- Syncs the **development** database schema with `push-force`, run
  non-interactively (stdin closed) so it can never hang waiting for a
  prompt
- Logs the exact command before/after each step and fails fast (non-zero
  exit) with a clear message if a step fails, instead of hanging or leaving
  things in an inconsistent state
- Workflow restarts after post-merge are handled automatically by the
  platform's workflow reconciliation step (not by this script)

This script is intentionally **not** used for production migrations — see
the generate-then-migrate flow above.

## Pre-deploy checklist

- [ ] All schema changes have a corresponding committed migration file in
      `lib/db/drizzle/migrations/`
- [ ] Each migration file has been read and confirmed non-destructive (or
      the destructive step is intentional and backed up)
- [ ] `pnpm run typecheck` passes
- [ ] Required production environment variables are set (see startup
      warnings from the API server for the current list, e.g.
      `APP_BASE_URL`, `RESEND_API_KEY`, `EMAIL_PROVIDER`,
      `ADMIN_ORDER_NOTIFICATION_EMAIL`)
- [ ] Migration applied to the production database
      (`pnpm --filter @workspace/db run migrate` against
      `PRODUCTION_DATABASE_URL`)
- [ ] App deployed/published and smoke-tested
