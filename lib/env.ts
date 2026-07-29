import {
  isProductionDatabase,
  isRemoteDbAllowed,
  LOCAL_DB_URL,
} from "@/lib/dev-db-guard.mjs";

const REQUIRED_AUTH_VARS = [
  "AUTH_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
] as const;

const SETUP_HELP = `Local development needs its own GitHub OAuth App. An OAuth App allows exactly
one authorization callback URL, so the deployed app's credentials cannot also
serve http://localhost:3000.

  1. Create an OAuth App at https://github.com/settings/developers
       Application name: GitCron (dev)
       Homepage URL:     http://localhost:3000
       Callback URL:     http://localhost:3000/api/auth/callback/github
  2. Put its Client ID and Client Secret in .env
  3. Generate AUTH_SECRET with: openssl rand -base64 32

Do not set AUTH_URL locally -- Auth.js infers the origin from the request and
already trusts the host outside production.

See the "Local development authentication" section of README.md.`;

/**
 * Fails fast when GitHub OAuth is not configured.
 *
 * A blank value counts as missing. `cp .env.example .env` leaves every key
 * present but empty, and Auth.js assigns provider credentials with `??=`
 * (@auth/core/lib/utils/env.js), so `""` is not nullish, never falls back to
 * `AUTH_GITHUB_ID`, and reaches GitHub as an empty `client_id`.
 */
export function assertAuthEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  const missing = REQUIRED_AUTH_VARS.filter((name) => !env[name]?.trim());

  if (missing.length === 0) return;

  const label =
    missing.length === 1
      ? "environment variable"
      : "environment variables";

  throw new Error(
    `Missing or empty auth ${label}: ${missing.join(", ")}\n\n${SETUP_HELP}`,
  );
}

/**
 * Keeps development off the production database.
 *
 * Schedules are rows, and the deployed cron reads every due row it finds. A
 * schedule created against the production database from a development machine
 * is therefore dispatched for real against a real repository -- the local app
 * never runs it, so nothing here reveals what happened.
 *
 * A safety net rather than a boundary: an absent, malformed, or simply
 * unrecognised DATABASE_URL passes, and production itself is exempt.
 */
export function assertNotProductionDatabase(
  env: Record<string, string | undefined> = process.env,
  expectedSha?: string,
): void {
  if (env.NODE_ENV === "production") return;
  if (isRemoteDbAllowed(env.ALLOW_REMOTE_DB)) return;

  const url = env.DATABASE_URL?.trim();
  if (!url || !isProductionDatabase(url, expectedSha)) return;

  throw new Error(
    `DATABASE_URL is the production database, but NODE_ENV is ` +
      `"${env.NODE_ENV ?? "undefined"}".

A schedule written here is picked up and executed by the production cron, which
dispatches a real workflow against a real repository. Nothing on this machine
would show that it happened.

Use your development database instead -- copy its connection string from
https://console.prisma.io and set DATABASE_URL in .env.

Or run one locally:

  npm run db:up
  npm run db:push
  DATABASE_URL=${LOCAL_DB_URL}

To use the production database deliberately, set ALLOW_REMOTE_DB=1.`,
  );
}
