# Migration history notes

## Known issue: checksum mismatch on `20260830070000_add_rack_management`

In this project's current development database, Prisma's `_prisma_migrations`
table has a stored checksum for `20260830070000_add_rack_management` that does
not match the checksum of the committed migration file. Running
`npx prisma migrate dev` against this database will detect that mismatch and
offer to reset the database.

**Do not accept that reset.** This database has real development data in it.

This has been verified (2026-09) to be a bookkeeping-only discrepancy, not
actual schema drift:

- The migration file itself has not been modified since it was committed
  (confirmed via `git log`/`git diff` — no changes since commit `8d59ff5`).
- A read-only `prisma migrate diff` comparing the live database against the
  committed schema (as of just before the Notification model was added)
  produced an **empty diff** — the live structure matches the intended
  end-state of all migrations exactly.
- Direct `information_schema`/`pg_catalog` introspection of the `Rack` table,
  `Order.rackId`, their indexes, and their foreign keys matches the
  `20260830070000_add_rack_management` migration SQL line for line.

The most likely explanation is that the migration's SQL file was edited
slightly after `prisma migrate dev` originally applied it to this database,
but before it was committed — a common, benign occurrence in solo/dev
database workflows.

### What this means for future migrations on this database

Until this is reconciled, `prisma migrate dev` cannot be used normally here —
it will always stop at the reset prompt because of this one migration's
checksum. New migrations on this specific database should instead go through
a reviewed, non-destructive path:

1. Update `prisma/schema.prisma`.
2. Generate the SQL for review only (does not touch the database):
   ```
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   ```
3. Manually review that output line by line — confirm it only contains the
   intended additive changes.
4. Create a new timestamped folder under `prisma/migrations/` and save the
   reviewed SQL as `migration.sql` inside it (do not touch any existing
   migration folder).
5. Apply it with `npx prisma migrate deploy` (not `migrate dev`) — `deploy`
   applies pending migrations without doing the strict drift/checksum
   comparison that trips on the rack migration.
6. Verify with `npx prisma migrate status` and a follow-up
   `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
   (expect an empty diff).

### Before production / go-live

This workaround is only appropriate for this specific, already-populated
development database. Before going to production, set up a clean database
(or environment) where the full committed migration history
(`prisma/migrations/`) can be applied from scratch with `prisma migrate deploy`
and passes without any checksum conflict, and confirm `prisma migrate dev`
behaves normally there. Do not carry this workaround into production tooling.
