-- Store profile (Store Settings).
--
-- PROPOSAL — requires approval before it is applied to any shared database.
--
-- Purely additive: adds nullable customer-facing profile columns and a
-- notification preference to "Organization". No existing column, row or
-- constraint is changed. Every new text column is NULL for existing stores,
-- which makes receipts and notifications keep their original built-in text;
-- "readyNotificationsEnabled" defaults to true, which keeps today's automatic
-- "ready for pickup" messages. Behaviour is unchanged until an Owner edits
-- Store Settings.
--
-- Runs in one transaction (Prisma adds none for PostgreSQL migrations), so
-- any failure leaves the table unchanged. Apply with the same reviewed steps
-- as 20261018000000_add_user_roles in prisma/MIGRATIONS.md: verified backup,
-- verified direct (non-pooler) connection, `migrate deploy`, never
-- `migrate dev`.
--
-- Rollback (only with an approved plan and a verified backup, and only after
-- the application code has been rolled back to a version that doesn't read
-- these columns):
--   BEGIN;
--   ALTER TABLE "Organization"
--     DROP COLUMN "displayName", DROP COLUMN "tagline", DROP COLUMN "phone",
--     DROP COLUMN "email", DROP COLUMN "addressLine1", DROP COLUMN "addressLine2",
--     DROP COLUMN "city", DROP COLUMN "region", DROP COLUMN "postalCode",
--     DROP COLUMN "businessHours", DROP COLUMN "receiptFooter",
--     DROP COLUMN "readyNotificationsEnabled";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261019000000_add_store_profile';
--   COMMIT;

BEGIN;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "businessHours" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "readyNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "receiptFooter" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "tagline" TEXT;

COMMIT;
