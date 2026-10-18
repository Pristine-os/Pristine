-- Employee Roles & Permissions.
--
-- Converts "User"."role" from free-form TEXT to a constrained enum and adds an
-- "active" flag. Existing rows keep their current role value (the old column
-- default was 'OWNER', so existing accounts remain Owners).
--
-- Atomicity: Prisma does not wrap PostgreSQL migrations in a transaction, so
-- everything below runs inside one explicit BEGIN/COMMIT. If any statement
-- fails — the invalid-role guard, a lock or statement timeout, a dropped
-- connection — PostgreSQL rolls the whole migration back and the schema and
-- rows are left exactly as they were. Prisma then records the migration as
-- failed; see prisma/MIGRATIONS.md for how to recover.
--
-- Pre-check (read-only):  SELECT role, count(*) FROM "User" GROUP BY role;
--
-- Rollback (manual; only with an approved rollback plan and a verified
-- backup, and only AFTER the application code has been rolled back to a
-- version that does not use "active" or the enum — see prisma/MIGRATIONS.md):
--   BEGIN;
--   ALTER TABLE "User" DROP COLUMN "active";
--   ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
--   ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
--   ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OWNER';
--   DROP TYPE "UserRole";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018000000_add_user_roles';
--   COMMIT;

BEGIN;

-- Guard: refuse to run if any role value can't be converted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" WHERE "role" NOT IN ('OWNER', 'MANAGER', 'EMPLOYEE')
  ) THEN
    RAISE EXCEPTION 'User.role contains values outside OWNER/MANAGER/EMPLOYEE; fix them before applying this migration';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'EMPLOYEE');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

COMMIT;
