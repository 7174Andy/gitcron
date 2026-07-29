/**
 * Shared by the app runtime (lib/env.ts) and the Prisma preflight
 * (scripts/check-dev-db.mjs).
 *
 * Plain .mjs because Node 20 cannot strip TypeScript types, so a script run
 * directly with `node` has to import runnable JavaScript. Keeping the logic
 * here means the two callers cannot drift apart.
 *
 * Why a fingerprint rather than a hostname check: every Prisma Postgres
 * database is reached at db.prisma.io:5432/postgres, so the development and
 * production databases differ only in their credentials. A "is this host
 * local?" test cannot tell them apart, and would reject a perfectly good
 * hosted development database.
 */
import { createHash } from "node:crypto";

/**
 * SHA-256 of the production database's username.
 *
 * Committed on purpose. The username is a 64-character opaque identifier, so
 * its hash is not reversible and reveals nothing usable; what it buys is the
 * ability to recognise the production database without keeping a production
 * credential on any development machine.
 *
 * Rotating the production database's credentials invalidates this, and the
 * guard silently stops recognising production. Take the value from Vercel, not
 * from a local .env -- a hash derived from the same file it is meant to check
 * confirms nothing:
 *
 *   npx vercel env pull --environment=production /tmp/prod.env
 *   node -e 'const{createHash}=require("crypto");console.log(
 *     createHash("sha256").update(new URL(process.argv[1]).username
 *     ).digest("hex"))' '<PRODUCTION_DATABASE_URL>'
 *
 * A wrong value fails open, and silently: the guard then recognises some other
 * database as production while leaving the real one unprotected. That happened
 * -- this constant identified a stale database until 2026-07-29, so `db push`
 * against real production would have been allowed. Verify after rotating.
 */
export const PROD_DB_USER_SHA256 =
  "d06a3780f8f786af3dd30f591cbe2b7628b4cfce6337f9e4f06f8d6038a93c66";

/** Connection string for the Docker database in docker/docker-compose.yml. */
export const LOCAL_DB_URL =
  "postgresql://postgres:dev@localhost:5433/gitcron_dev";

/** The username a connection string authenticates as, or null if unparseable. */
export function databaseUser(url) {
  try {
    return new URL(url).username || null;
  } catch {
    return null;
  }
}

/**
 * Whether this connection string is the production database.
 *
 * Unparseable input is not production: this is a safety net, and a malformed
 * DATABASE_URL is Prisma's to report with a better message than ours.
 */
export function isProductionDatabase(url, expectedSha = PROD_DB_USER_SHA256) {
  if (!expectedSha) return false;

  const user = databaseUser(url);
  if (!user) return false;

  return createHash("sha256").update(user).digest("hex") === expectedSha;
}

/** Whether ALLOW_REMOTE_DB opts out of the guard. */
export function isRemoteDbAllowed(value) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}
