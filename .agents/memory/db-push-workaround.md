---
name: DB schema push — interactive prompt workaround
description: drizzle-kit push always blocks on a favorites unique constraint prompt; use raw psql for simple column additions.
---

## Rule
`pnpm --filter @workspace/db run push` (and `push-force`) consistently blocks on an interactive prompt:
> "You're about to add favorites_user_id_poster_id_unique unique constraint to the table... Do you want to truncate favorites table?"

This is a pre-existing pending migration that has never been applied. The prompt cannot be piped non-interactively via the bash tool.

**Why:** The bash tool kills any process that waits for stdin; drizzle-kit uses inquirer prompts which cannot be fed via pipe.

**How to apply:** For simple `ADD COLUMN IF NOT EXISTS` operations, use raw psql instead:
```bash
psql "$DATABASE_URL" -c "ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type>;"
```
Then update the Drizzle schema file for type-safety — the schema file and DB stay in sync without running `push`.

If a full schema migration is eventually needed (e.g. for the favorites constraint), it will require manual intervention in a real shell session.
