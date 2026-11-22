-- Password reset session invalidation.
--
-- PROPOSAL — requires approval before it is applied to any shared database.
--
-- Purely additive: adds "User"."sessionVersion" (INTEGER NOT NULL DEFAULT 0).
-- Every existing user gets 0, and login sessions issued before this change
-- carry no version, which the application treats as 0 — so nobody is logged
-- out by this migration or the deploy that follows it. From then on, a
-- password reset or deactivation increments the user's version, and any
-- session issued with an older version is refused.
--
-- Runs in one transaction (Prisma adds none for PostgreSQL migrations), so a
-- failure leaves the table unchanged. Apply with the reviewed steps in
-- prisma/MIGRATIONS.md: verified backup, verified direct (non-pooler)
-- connection, `migrate deploy`, never `migrate dev`. Apply it before
-- deploying the code that reads the column.
--
-- Rollback (only with an approved plan and a verified backup, and only after
-- the application code has been rolled back to a version that doesn't read
-- this column):
--   BEGIN;
--   ALTER TABLE "User" DROP COLUMN "sessionVersion";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261122000000_add_user_session_version';
--   COMMIT;

BEGIN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

COMMIT;
