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
  2. Put its Client ID and Client Secret in .env.local
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
