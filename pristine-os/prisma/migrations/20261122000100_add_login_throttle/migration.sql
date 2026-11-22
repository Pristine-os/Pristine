-- Login abuse protection (lib/loginThrottle.ts).
--
-- PROPOSAL — requires approval before it is applied to any shared database.
--
-- Purely additive: creates a new "LoginThrottle" table; no existing table,
-- column or row is touched. Each row is one throttle key (an account, a
-- network, or an account on a network), identified only by an HMAC of the
-- key — never the email address or IP. Rows are short-lived: counters reset
-- after 15 quiet minutes and idle rows are deleted after a day.
--
-- Runs in one transaction (Prisma adds none for PostgreSQL migrations), so a
-- failure leaves the database unchanged. Apply with the reviewed steps in
-- prisma/MIGRATIONS.md: verified backup, verified direct (non-pooler)
-- connection, `migrate deploy`, never `migrate dev`. Apply it before
-- deploying the code that uses the table — without it, every login fails.
--
-- Rollback (only with an approved plan and a verified backup, and only after
-- the application code has been rolled back to a version that doesn't use
-- this table; the table holds no business data):
--   BEGIN;
--   DROP TABLE "LoginThrottle";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261122000100_add_login_throttle';
--   COMMIT;

BEGIN;

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("keyHash")
);

-- CreateIndex
CREATE INDEX "LoginThrottle_lastAttemptAt_idx" ON "LoginThrottle"("lastAttemptAt");

COMMIT;
