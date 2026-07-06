#!/bin/bash
# Post-merge setup: runs automatically after a task is merged into main.
#
# Guardrails:
#   - Never blocks on stdin (every command is run with stdin redirected from
#     /dev/null, and only non-interactive/force flags are used).
#   - Fails fast and loudly (set -euo pipefail) rather than hanging or
#     silently leaving the environment half-updated.
#   - Logs the exact command being run before and after execution so a
#     hang or failure is easy to diagnose from the post-merge log files.
#
# This script is for DEVELOPMENT recovery only. It uses `drizzle-kit push
# --force`, which is fine for keeping the dev database in sync but must
# NOT be used for production. See PRODUCTION_DEPLOYMENT_CHECKLIST.md for the
# reviewed generate-then-migrate flow used at deploy time.

set -euo pipefail

log() {
  echo "[post-merge $(date -u +%H:%M:%S)] $*"
}

fail() {
  log "FAILED: $*"
  exit 1
}

log "Starting post-merge setup"

INSTALL_CMD="pnpm install --frozen-lockfile"
log "Running: ${INSTALL_CMD}"
if ! ${INSTALL_CMD} < /dev/null; then
  fail "dependency install failed (see output above). Fix the lockfile/dependency issue and re-run post-merge."
fi
log "Dependency install complete"

DB_PUSH_CMD="pnpm --filter @workspace/db run push-force"
log "Running: ${DB_PUSH_CMD} (non-interactive, stdin closed)"
if ! ${DB_PUSH_CMD} < /dev/null; then
  fail "database schema push failed. This does not leave the DB partially migrated, but workflows may still be using the old schema — restart them after fixing the underlying schema/migration issue."
fi
log "Database schema push complete"

log "Post-merge setup finished successfully"
