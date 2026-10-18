-- Employee Roles & Permissions.
--
-- Converts "User"."role" from free-form TEXT to a constrained enum and adds an
-- "active" flag. Existing rows keep their current role value (the old column
-- default was 'OWNER', so existing accounts remain Owners).
--
-- Prisma does not wrap PostgreSQL migrations in a transaction, so the guard
-- below runs first and aborts before anything changes if any existing row
-- holds a role outside OWNER / MANAGER / EMPLOYEE.
--
-- Pre-check (read-only):  SELECT role, count(*) FROM "User" GROUP BY role;
--
-- Rollback (manual, only if needed):
--   ALTER TABLE "User" DROP COLUMN "active";
--   ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
--   ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
--   ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OWNER';
--   DROP TYPE "UserRole";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018000000_add_user_roles';

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
