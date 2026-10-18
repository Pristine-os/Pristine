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

## `20261018000000_add_user_roles` (Employee Roles & Permissions)

Converts `User.role` from free-form text to the `UserRole` enum
(`OWNER` / `MANAGER` / `EMPLOYEE`), changes its default from `OWNER` to
`EMPLOYEE`, and adds `User.active` (default `true`). Existing accounts keep
their current role — every account created so far defaulted to `OWNER`, so
existing logins keep full access.

The whole migration runs inside one explicit `BEGIN; … COMMIT;` (Prisma does
not add a transaction for PostgreSQL migrations). Any failure — the
invalid-role guard, a lock or statement timeout, a dropped connection —
rolls everything back and leaves the schema and rows unchanged.

### Deploy order

Apply this migration **before** deploying the code that uses it. The new code
reads `User.active` and fails without it; the old code keeps working after the
migration.

### Applying it to the Supabase development database

Never use `migrate dev` and never accept a reset here (see the rack checksum
issue above).

1. **Back up and review the backup.** Take a backup of the development
   database and confirm it is restorable (it lists the `User` table and the
   expected row counts) before continuing. Record where it is stored.

2. **Verify you have a direct database connection, not the pooler.** Use the
   *direct connection* string from the Supabase dashboard (Connect → Direct
   connection), passed only to the migration commands — do not change the
   app's `DATABASE_URL`. Do not rely on the port: the session pooler also
   listens on 5432. Check the actual endpoint:
   - Host must be `db.<project-ref>.supabase.co`. A host containing
     `pooler.supabase.com` is the pooler (port 6543 = transaction mode,
     5432 = session mode) — stop and get the direct string.
   - Username must be plain `postgres`. `postgres.<project-ref>` is the
     pooler's username format.
   - Confirm the connection works and points at the expected database, without
     changing anything:
     ```
     DATABASE_URL="<direct connection string>" npx prisma migrate status
     ```
     The output's `Datasource "db"` line must show the `db.<project-ref>.supabase.co`
     host, and the only pending migration must be `20261018000000_add_user_roles`.

3. **Read-only pre-check** — every value must be `OWNER`, `MANAGER` or `EMPLOYEE`:
   ```
   SELECT role, count(*) FROM "User" GROUP BY role;
   ```

4. **Apply:**
   ```
   DATABASE_URL="<direct connection string>" npx prisma migrate deploy
   ```

5. **Verify:**
   ```
   DATABASE_URL="<direct connection string>" npx prisma migrate status
   DATABASE_URL="<direct connection string>" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   SELECT role, active, count(*) FROM "User" GROUP BY role, active;
   ```
   Expect "Database schema is up to date", an empty diff, and every existing
   account still `OWNER` and `active = true`.

### If `migrate deploy` fails

The transaction rolls back, so the schema and data are unchanged, but Prisma
records the migration as failed and blocks further deploys (error `P3009`).

- Prisma's own error message will usually read only `current transaction is
  aborted…`: after the failure it tries to log on the same aborted
  connection, so the real cause is lost from its output and the
  `_prisma_migrations.logs` column. Find the real error in the Supabase
  Postgres logs (Logs → Postgres) for the time of the attempt, or re-run the
  pre-check in step 3.
- Confirm nothing changed: `"User"."role"` is still `text` and the
  `UserRole` type does not exist:
  ```
  SELECT data_type FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role';
  SELECT count(*) FROM pg_type WHERE typname = 'UserRole';
  ```
- Fix the cause, then mark the attempt as rolled back and deploy again:
  ```
  DATABASE_URL="<direct connection string>" npx prisma migrate resolve --rolled-back 20261018000000_add_user_roles
  DATABASE_URL="<direct connection string>" npx prisma migrate deploy
  ```
  Only use `--rolled-back` after confirming the schema is unchanged.

### Rolling back after a successful migration

Only with an approved rollback plan and a verified backup taken immediately
before the rollback:

1. **Roll back the application code first** to a version that does not use
   `User.active` or the `UserRole` enum, and confirm it is serving traffic.
   Rolling back the database while the new code is running breaks every
   request.
2. **Then roll back the database** with the SQL in the header comment of the
   migration file (it runs in one transaction and removes the
   `_prisma_migrations` row). Role values are kept as text; MANAGER and
   EMPLOYEE assignments survive, but deactivation flags are lost.
3. Verify with `migrate status` (the migration shows as pending again) and
   the `information_schema` checks above.

### Verification already done (throwaway local databases only)

Each scenario started from the full prior migration history with existing
rows (an implicit-default Owner, an explicit Owner, a Manager, an order):

- Success: existing roles kept (Owners stay `OWNER`), `active = true` on all
  rows, new rows default to `EMPLOYEE`, unrelated rows untouched, post-migration
  diff empty.
- Forced failures — invalid role (guard), a view depending on `User.role`
  (fails after the enum is created and the default dropped), a pre-existing
  `active` column (fails on the last statement): in every case the schema and
  all rows were identical before and after, the migration was recorded as
  unfinished, further deploys were blocked with `P3009`, and after fixing the
  cause `migrate resolve --rolled-back` + `migrate deploy` succeeded.
