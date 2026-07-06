---
name: DB schema push — non-interactive behavior and prod boundary
description: drizzle-kit push --force with closed stdin resolves prompts to the safe default instead of hanging; still dev-only, never for production.
---

## Rule
`drizzle-kit push --force` (run as `pnpm --filter @workspace/db run push-force`)
still *prints* an interactive-looking prompt for risky changes (e.g. the
`favorites_user_id_poster_id_unique` constraint asking whether to truncate
the table), but when stdin is closed/redirected from `/dev/null` it resolves
to the default (safe, non-destructive) option automatically instead of
hanging. It does not need psql workarounds anymore.

**Why:** Earlier attempts assumed the prompt was unresolvable non-interactively
and used raw `psql` for column additions instead. In practice the platform's
post-merge runner already closes stdin, so the real failure mode was the
combined `pnpm install` + schema-pull step (~15-20s) running right up against
the old 20s post-merge timeout — not an unresolvable prompt. Bumped
`post-merge` timeoutMs to 60000 to give headroom.

**How to apply:**
- For dev/post-merge scripts, always redirect stdin explicitly
  (`... < /dev/null`) even though the platform already closes it — makes the
  script safe when run manually too.
- `push` / `push-force` are dev-only. Production schema changes must use the
  generate-then-migrate flow (`drizzle-kit generate` → commit SQL →
  `drizzle-kit migrate`) — see `PRODUCTION_DEPLOYMENT_CHECKLIST.md` at repo
  root.
